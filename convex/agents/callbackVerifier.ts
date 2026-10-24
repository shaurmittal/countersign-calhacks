// Callback Verifier (owner: P2). Spec §6.4.
// Dials vendors.phoneOnFile ONLY. The number is read from the database here and never taken
// from model output or the request. Anything other than a clear "confirmed" is not verified.
//
// Flow:
//   pipeline schedules start({ caseId })
//   start → prepare (callbacks row + War Room lane) → Cartesia outbound call → markDialed
//   the callback agent calls the record_callback_outcome tool → reportFromAgent → applyOutcome
//   expire() fires after CALL_DEADLINE_MS and records no_answer if nothing came back
//   applyOutcome retries a no_answer once, otherwise re-runs the pipeline
import { v } from "convex/values";
import { internalAction, internalMutation, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { CallbackOutcome, PaymentRequest } from "../../shared/types";
import { LIMITS } from "../../shared/config";
import { appendAudit } from "../audit";
import { finishRun, startRun } from "../agentRuns";
import { placeOutboundCall, spokenAmount } from "../lib/cartesia";

const MAX_ATTEMPTS = 2;
// Ringing timeout plus a short conversation; after this a missing outcome counts as no_answer.
const CALL_DEADLINE_MS = (LIMITS.callbackAnswerTimeoutSeconds + 135) * 1000;

const outcomeValidator = v.union(
  v.literal("confirmed"),
  v.literal("denied"),
  v.literal("no_answer"),
  v.literal("unclear"),
);

export const start = internalAction({
  args: { caseId: v.id("cases"), attempt: v.optional(v.number()) },
  handler: async (ctx, { caseId, attempt }) => {
    const prep = await ctx.runMutation(internal.agents.callbackVerifier.prepare, { caseId, attempt: attempt ?? 1 });
    if (!prep) return;
    try {
      const callSid = await placeOutboundCall({
        toNumber: prep.toNumber,
        dynamicVariables: prep.dynamicVariables,
        ringingTimeoutSeconds: LIMITS.callbackAnswerTimeoutSeconds,
      });
      await ctx.runMutation(internal.agents.callbackVerifier.markDialed, { callbackId: prep.callbackId, callSid });
      await ctx.scheduler.runAfter(CALL_DEADLINE_MS, internal.agents.callbackVerifier.expire, {
        callbackId: prep.callbackId,
      });
    } catch (err) {
      await ctx.runMutation(internal.agents.callbackVerifier.recordOutcome, {
        callbackId: prep.callbackId,
        outcome: "no_answer",
        note: `dial failed: ${String(err).slice(0, 300)}`,
      });
    }
  },
});

/** Creates the callbacks row and the War Room lane. Returns null when there is no vendor to call. */
export const prepare = internalMutation({
  args: { caseId: v.id("cases"), attempt: v.number() },
  handler: async (ctx, { caseId, attempt }) => {
    const c = await ctx.db.get(caseId);
    const vendor = c?.vendorId ? await ctx.db.get(c.vendorId) : null;
    const owner = await ctx.db.query("owner").first();
    const runId = await startRun(ctx, { caseId, agent: "callback", input: { attempt } });
    if (!c || !vendor) {
      // Policy should never ask for a callback without a vendor match; the case simply stays held.
      await finishRun(ctx, runId, { error: "No vendor on file to call back" });
      return null;
    }

    const callbackId = await ctx.db.insert("callbacks", {
      caseId,
      vendorId: vendor._id,
      numberDialed: vendor.phoneOnFile,
      agentRunId: runId,
      attempt,
      startedAt: Date.now(),
    });
    await appendAudit(ctx, {
      caseId,
      actor: "callback",
      action: "callback.dialing",
      payload: { vendor: vendor.name, numberLast4: vendor.phoneOnFile.slice(-4), attempt },
    });

    const request = c.request as PaymentRequest | undefined;
    const newAccount = request?.newBankDetails?.account;
    return {
      callbackId,
      toNumber: vendor.phoneOnFile,
      // Read by the callback agent's prompt as {{variable}}. The invoice number is deliberately
      // NOT sent: the vendor has to say it, so "yes to everything" can't confirm (spec §8.2).
      dynamicVariables: {
        callback_id: callbackId,
        owner_name: owner?.name ?? "the owner",
        company_name: owner?.company ?? "our company",
        vendor_name: vendor.name,
        amount: spokenAmount(request?.amountCents),
        bank_change: newAccount ? "yes" : "no",
        new_account_last4: newAccount ? newAccount.replace(/\D/g, "").slice(-4) : "",
      },
    };
  },
});

export const markDialed = internalMutation({
  args: { callbackId: v.id("callbacks"), callSid: v.string() },
  handler: async (ctx, { callbackId, callSid }) => {
    const cb = await ctx.db.get(callbackId);
    if (!cb) return;
    await ctx.db.patch(callbackId, { callSid });
    await appendAudit(ctx, { caseId: cb.caseId, actor: "callback", action: "callback.dialed", payload: { callSid } });
  },
});

/** Called from the record_callback_outcome tool. Cross-checks the invoice number the vendor said. */
export const reportFromAgent = internalMutation({
  args: {
    callbackId: v.id("callbacks"),
    outcome: outcomeValidator,
    invoiceNumberStated: v.optional(v.string()),
    conversationId: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { callbackId, outcome, invoiceNumberStated, conversationId, notes }) => {
    const cb = await ctx.db.get(callbackId);
    if (!cb) return { ok: false as const, message: "Unknown callback." };
    if (cb.outcome) return { ok: true as const, message: "Outcome already recorded. Thank them and end the call." };

    let final: CallbackOutcome = outcome;
    let note = notes;
    if (outcome === "confirmed") {
      const c = await ctx.db.get(cb.caseId);
      const expected = (c?.request as PaymentRequest | undefined)?.invoiceNumber ?? null;
      if (expected && normalizeInvoice(invoiceNumberStated) !== normalizeInvoice(expected)) {
        final = "unclear";
        note = `Vendor said yes but gave invoice "${invoiceNumberStated ?? "none"}"; request was for "${expected}". ${notes ?? ""}`.trim();
      }
    }
    if (conversationId && cb.callSid && conversationId !== cb.callSid) {
      note = `${note ?? ""} [conversation id ${conversationId} != dialed call ${cb.callSid}]`.trim();
    }
    await applyOutcome(ctx, cb, final, { note });
    return { ok: true as const, message: "Recorded. Thank them politely and end the call." };
  },
});

/** Generic entry point, e.g. for dial failures or manual testing with `npx convex run`. */
export const recordOutcome = internalMutation({
  args: {
    callbackId: v.id("callbacks"),
    outcome: outcomeValidator,
    transcript: v.optional(v.string()),
    recordingUrl: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { callbackId, outcome, ...extra }) => {
    const cb = await ctx.db.get(callbackId);
    if (!cb) throw new Error(`callback ${callbackId} not found`);
    await applyOutcome(ctx, cb, outcome, extra);
  },
});

export const expire = internalMutation({
  args: { callbackId: v.id("callbacks") },
  handler: async (ctx, { callbackId }) => {
    const cb = await ctx.db.get(callbackId);
    if (cb && !cb.outcome) await applyOutcome(ctx, cb, "no_answer", { note: "No outcome before the call deadline" });
  },
});

async function applyOutcome(
  ctx: MutationCtx,
  cb: Doc<"callbacks">,
  outcome: CallbackOutcome,
  extra: { transcript?: string; recordingUrl?: string; note?: string },
) {
  if (cb.outcome) return; // first outcome wins; late tool calls and timers are ignored
  const { note, ...stored } = extra;
  await ctx.db.patch(cb._id, { ...stored, outcome, endedAt: Date.now() });

  const vendor = await ctx.db.get(cb.vendorId);
  await appendAudit(ctx, {
    caseId: cb.caseId,
    actor: "callback",
    action: "callback.outcome",
    payload: { outcome, attempt: cb.attempt, numberLast4: cb.numberDialed.slice(-4), note },
  });
  if (cb.agentRunId) {
    await finishRun(ctx, cb.agentRunId, {
      output: { outcome, note },
      summary: `${vendor?.name ?? "Vendor"} (on file …${cb.numberDialed.slice(-4)}): ${outcome}`,
    });
  }

  if (outcome === "no_answer" && cb.attempt < MAX_ATTEMPTS) {
    await ctx.scheduler.runAfter(LIMITS.callbackRetryDelaySeconds * 1000, internal.agents.callbackVerifier.start, {
      caseId: cb.caseId,
      attempt: cb.attempt + 1,
    });
    return;
  }
  await ctx.scheduler.runAfter(0, internal.pipeline.advance, { caseId: cb.caseId as Id<"cases"> });
}

function normalizeInvoice(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/^(invoice|inv|number|no\.?|#)\s*/g, "").replace(/[^a-z0-9]/g, "");
}
