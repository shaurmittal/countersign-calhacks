// Callback Verifier (owner: P2). Spec §6.4.
// Dials vendors.phoneOnFile ONLY. The number is read from the database here and never taken
// from model output or the request. Anything other than a clear "confirmed" is not verified.
//
// Flow:
//   pipeline schedules start({ caseId })
//   start → prepare (callbacks row + War Room lane) → Cartesia outbound call → markDialed
//   the callback agent calls the record_callback_outcome tool → reportFromAgent → applyOutcome
//   expire() fires after CALL_DEADLINE_MS and records no_answer if nothing came back
//   applyOutcome re-runs the pipeline, which owns the decision to retry a no_answer
//   (it calls start() again; each call gets a new callbacks row with attempt = existing + 1)
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { CallbackOutcome, PaymentRequest, VendorFindings } from "../../shared/types";
import { LIMITS } from "../../shared/config";
import { appendAudit } from "../audit";
import { finishRun, startRun } from "../agentRuns";
import { getCall, placeOutboundCall, spokenAmount } from "../lib/cartesia";

// Ringing timeout plus a short conversation; after this a missing outcome counts as no_answer.
const CALL_DEADLINE_MS = (LIMITS.callbackAnswerTimeoutSeconds + 135) * 1000;

const outcomeValidator = v.union(
  v.literal("confirmed"),
  v.literal("denied"),
  v.literal("no_answer"),
  v.literal("unclear"),
);

export const start = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const prep = await ctx.runMutation(internal.agents.callbackVerifier.prepare, { caseId });
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
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.db.get(caseId);
    const previous = await ctx.db
      .query("callbacks")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();
    if (previous.some((cb) => !cb.outcome)) return null; // a call for this case is already in progress
    const attempt = previous.length + 1;
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
    // Requests often name only the invoice ("send #1042"); read its amount so the vendor hears a figure.
    const invoiceId = (c.vendorFindings as VendorFindings | undefined)?.matchingInvoiceId;
    const invoiceDocId = invoiceId ? ctx.db.normalizeId("invoices", invoiceId) : null;
    const invoice = invoiceDocId ? await ctx.db.get(invoiceDocId) : null;
    const amountCents = request?.amountCents ?? invoice?.amountCents ?? null;
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
        amount: spokenAmount(amountCents),
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

  await ctx.scheduler.runAfter(0, internal.pipeline.advance, { caseId: cb.caseId as Id<"cases"> });
  // The agent usually says goodbye after recording the outcome, so give the call time to end.
  if (cb.callSid) {
    await ctx.scheduler.runAfter(TRANSCRIPT_DELAY_MS, internal.agents.callbackVerifier.fetchTranscript, {
      callbackId: cb._id,
      triesLeft: 3,
    });
  }
}

const TRANSCRIPT_DELAY_MS = 15_000;

/** Stores the call transcript and summary (for the War Room and the audit trail). Never affects the decision. */
export const fetchTranscript = internalAction({
  args: { callbackId: v.id("callbacks"), triesLeft: v.number() },
  handler: async (ctx, { callbackId, triesLeft }) => {
    const cb = await ctx.runQuery(internal.agents.callbackVerifier.getCallback, { callbackId });
    if (!cb?.callSid) return;
    try {
      const call = await getCall(cb.callSid, cb.vendorName);
      if (call.status !== "completed" && triesLeft > 1) {
        await ctx.scheduler.runAfter(TRANSCRIPT_DELAY_MS, internal.agents.callbackVerifier.fetchTranscript, {
          callbackId,
          triesLeft: triesLeft - 1,
        });
        return;
      }
      await ctx.runMutation(internal.agents.callbackVerifier.saveTranscript, {
        callbackId,
        transcript: call.transcript ?? undefined,
        summary: call.summary ?? undefined,
        endReason: call.endReason ?? undefined,
      });
    } catch (err) {
      console.warn(`[callback] transcript fetch failed for ${callbackId}: ${String(err).slice(0, 200)}`);
      if (triesLeft > 1) {
        await ctx.scheduler.runAfter(TRANSCRIPT_DELAY_MS, internal.agents.callbackVerifier.fetchTranscript, {
          callbackId,
          triesLeft: triesLeft - 1,
        });
      }
    }
  },
});

export const getCallback = internalQuery({
  args: { callbackId: v.id("callbacks") },
  handler: async (ctx, { callbackId }) => {
    const cb = await ctx.db.get(callbackId);
    if (!cb) return null;
    const vendor = await ctx.db.get(cb.vendorId);
    return { callSid: cb.callSid ?? null, vendorName: vendor?.name ?? "Vendor" };
  },
});

export const saveTranscript = internalMutation({
  args: {
    callbackId: v.id("callbacks"),
    transcript: v.optional(v.string()),
    summary: v.optional(v.string()),
    endReason: v.optional(v.string()),
  },
  handler: async (ctx, { callbackId, transcript, summary, endReason }) => {
    const cb = await ctx.db.get(callbackId);
    if (!cb) return;
    await ctx.db.patch(callbackId, { transcript, summary });
    await appendAudit(ctx, {
      caseId: cb.caseId,
      actor: "callback",
      action: "callback.transcript",
      // The full transcript lives on the callbacks row; the chain records that it was captured.
      payload: { summary: summary ?? null, lines: transcript ? transcript.split("\n").length : 0, endReason: endReason ?? null },
    });
  },
});

function normalizeInvoice(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/^(invoice|inv|number|no\.?|#)\s*/g, "").replace(/[^a-z0-9]/g, "");
}
