// Countersign leader (owner: P1). Spec §6.6.
// `advance` is an idempotent step function: it looks at what the case already has, runs the
// next missing step, asks the Policy Engine, and acts on the result. It is re-run whenever an
// external event lands (callback outcome, owner approval, cooling-off timer).
//
//   RECEIVED → PARSED → VERIFYING → (CALLBACK_PENDING) → DECIDED → (AWAITING_OWNER) → CLOSED
//
// Models read, reason and propose. Only decide() (shared/policy/engine.ts) can return PAY,
// and only the PAY branch below calls the Payer, behind the cases.claimPayment lock.
import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { decide } from "../shared/policy/engine";
import { DEMO_POLICY, LIMITS } from "../shared/config";
import type {
  ApprovalState,
  CallbackOutcome,
  InvoiceRecord,
  PaymentRequest,
  PolicyResult,
  RiskFindings,
  VendorFindings,
  VendorRecord,
} from "../shared/types";
import { withAgentRun } from "./lib/withAgentRun";
import { composeReply } from "./lib/claude";
import { EMPTY_REQUEST, runIntake, summarizeIntake } from "./agents/intake";
import { runVendorVerifier } from "./agents/vendorVerifier";
import { runRiskAnalyst } from "./agents/riskAnalyst";
import { runPayer } from "./agents/payer";

export const loadContext = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.db.get(caseId);
    if (!c) return null;
    const owner = await ctx.db.query("owner").first();
    const vendor = c.vendorId ? await ctx.db.get(c.vendorId) : null;
    const invoiceId = (c.vendorFindings as VendorFindings | undefined)?.matchingInvoiceId;
    const normalized = invoiceId ? ctx.db.normalizeId("invoices", invoiceId) : null;
    const invoice = normalized ? await ctx.db.get(normalized) : null;
    const callbacks = await ctx.db
      .query("callbacks")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();
    const approval = await ctx.db
      .query("approvals")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .order("desc")
      .first();
    return { c, owner, vendor, invoice, callbacks, approval };
  },
});

function toVendorRecord(vendor: Doc<"vendors"> | null): VendorRecord | null {
  if (!vendor) return null;
  const [min, max] = vendor.typicalAmountRange;
  return { id: vendor._id, name: vendor.name, typicalAmountRange: [min, max], alwaysEscalate: vendor.alwaysEscalate };
}

function toInvoice(i: Doc<"invoices"> | null): InvoiceRecord | null {
  if (!i) return null;
  return { id: i._id, number: i.number, amountCents: i.amountCents, status: i.status, paidAt: i.paidAt ?? null };
}

function toApproval(a: Doc<"approvals"> | null): ApprovalState | null {
  if (!a) return null;
  return {
    method: a.method,
    approved: !!a.approvedAt && !a.cancelledAt,
    cancelled: !!a.cancelledAt,
    coolingOffUntil: a.coolingOffUntil ?? null,
  };
}

/** Runs an agent step; a failure is recorded on its War Room lane and becomes null (the engine HOLDs on null). */
async function safely<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

export const advance = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const loaded = await ctx.runQuery(internal.pipeline.loadContext, { caseId });
    if (!loaded || loaded.c.status === "CLOSED") return;
    const { c, owner } = loaded;
    const biz = { ownerName: owner?.name ?? "the owner", company: owner?.company ?? "this business" };

    // 1. Intake
    let request = c.request as PaymentRequest | undefined;
    if (!request) {
      request =
        (await safely(() => withAgentRun(ctx, caseId, "intake", () => runIntake(ctx, c, owner), summarizeIntake))) ??
        EMPTY_REQUEST;
      await ctx.runMutation(internal.cases.update, { caseId, request, status: "PARSED", actor: "intake" });
    }
    const req = request;

    // 2. Vendor Verifier ∥ Risk Analyst. Skipped when nothing was asked for.
    let vendorFindings = (c.vendorFindings as VendorFindings | undefined) ?? null;
    let riskFindings = (c.riskFindings as RiskFindings | undefined) ?? null;
    if (req.requestedAction !== "none" && (!vendorFindings || !riskFindings)) {
      await ctx.runMutation(internal.cases.update, { caseId, status: "VERIFYING" });
      [vendorFindings, riskFindings] = await Promise.all([
        vendorFindings ?? safely(() => withAgentRun(ctx, caseId, "vendorVerifier", () => runVendorVerifier(ctx, c, req))),
        riskFindings ?? safely(() => withAgentRun(ctx, caseId, "riskAnalyst", () => runRiskAnalyst(ctx, c, req))),
      ]);
      await ctx.runMutation(internal.cases.update, {
        caseId,
        vendorFindings: vendorFindings ?? undefined,
        riskFindings: riskFindings ?? undefined,
        vendorId: (vendorFindings?.vendorId ? vendorFindings.vendorId : undefined) as Id<"vendors"> | undefined,
        riskScore: riskFindings?.riskScore,
        flags: riskFindings?.flags,
      });
    }

    // 3. Policy Engine (deterministic)
    const ctxNow = await ctx.runQuery(internal.pipeline.loadContext, { caseId });
    if (!ctxNow) return;
    const { vendor, invoice, callbacks, approval } = ctxNow;
    const latestCallback = callbacks.at(-1) ?? null;
    const callbackOutcome: CallbackOutcome | null = latestCallback?.outcome ?? null;

    const result = await withAgentRun(
      ctx,
      caseId,
      "policy",
      async () =>
        decide({
          request: req,
          vendor: toVendorRecord(vendor),
          vendorFindings,
          riskFindings,
          invoice: toInvoice(invoice),
          callbackOutcome,
          approval: toApproval(approval),
          policy: owner?.policy ?? DEMO_POLICY,
          now: Date.now(),
        }),
      (r) => `${r.decision} · ${r.firedRules.join(" ")}`,
    );
    await ctx.runMutation(internal.cases.update, { caseId, policyResult: result, decision: result.decision, actor: "policy" });

    const reply = async (paymentSent = false, callbackInProgress = false, decided: PolicyResult = result) => {
      const { text, source } = await composeReply({
        channel: c.channel,
        rawContent: c.rawContent,
        result: decided,
        biz,
        ctx: {
          company: biz.company,
          vendorName: vendor?.name ?? null,
          invoiceNumber: invoice?.number ?? req.invoiceNumber,
          paymentSent,
          callbackInProgress,
        },
      });
      await ctx.runMutation(internal.cases.update, { caseId, replyText: text, actor: `leader:${source}` });
      await ctx.scheduler.runAfter(0, internal.channels.reply.dispatch, { caseId });
    };

    const finish = async (decided: PolicyResult, paymentSent = false) => {
      await ctx.runMutation(internal.cases.update, { caseId, decision: decided.decision, status: "CLOSED" });
      await reply(paymentSent, false, decided);
      if (decided.decision !== "NO_ACTION") {
        await ctx.scheduler.runAfter(0, internal.agents.ownerConcierge.notifyOwner, {
          caseId,
          text: `${decided.decision} (${decided.firedRules.join(", ")}): ${decided.reasons.join("; ")}`,
        });
      }
    };

    // 4. Act on the result

    // 4a. Callback needed and not placed yet / still ringing.
    if (result.needs.callback) {
      if (!latestCallback) {
        await ctx.scheduler.runAfter(0, internal.agents.callbackVerifier.start, { caseId });
        await ctx.runMutation(internal.cases.update, { caseId, status: "CALLBACK_PENDING" });
        await reply(false, true);
      } else if (latestCallback.outcome == null) {
        await ctx.runMutation(internal.cases.update, { caseId, status: "CALLBACK_PENDING" });
      }
      return; // callbackVerifier.recordOutcome re-runs advance
    }

    // 4b. Nobody answered: one retry (spec §6.4), then the engine's no_answer path stands.
    if (callbackOutcome === "no_answer" && callbacks.length < 2 && result.decision !== "BLOCK") {
      await ctx.scheduler.runAfter(LIMITS.callbackRetryDelaySeconds * 1000, internal.agents.callbackVerifier.start, { caseId });
      await ctx.runMutation(internal.cases.update, { caseId, status: "CALLBACK_PENDING" });
      return;
    }

    // 4c. PAY: the only path to the Payer.
    if (result.decision === "PAY") {
      const claimed = await ctx.runMutation(internal.cases.claimPayment, { caseId });
      if (!claimed) return; // another run is already paying this case
      if (result.firedRules.includes("R2")) {
        await ctx.runMutation(internal.cases.applyConfirmedBankChange, { caseId });
      }
      const fresh = await ctx.runQuery(internal.cases.get, { caseId });
      const paid = await safely(() =>
        withAgentRun(ctx, caseId, "payer", () => runPayer(ctx, fresh ?? c), (p) => (p.ok ? `Paid: ${p.externalId}` : `Failed: ${p.error}`)),
      );
      if (paid?.ok) {
        await finish(result, true);
      } else {
        const error = paid && !paid.ok ? paid.error : "Payer crashed";
        await finish({
          ...result,
          decision: "HOLD",
          reasons: [...result.reasons, `Payment rail failed: ${error}`],
        });
      }
      return;
    }

    // 4d. Owner step-up.
    if (result.decision === "ESCALATE") {
      await ctx.runMutation(internal.cases.update, { caseId, status: "AWAITING_OWNER" });
      if (!approval) {
        await ctx.scheduler.runAfter(0, internal.agents.ownerConcierge.requestApproval, { caseId });
        await reply();
      }
      return; // ownerConcierge re-runs advance on approval
    }

    // 4e. Approved, cooling-off running: wake up when it ends (the owner can still cancel).
    const coolingOff = result.decision === "HOLD" && result.reasons.some((r) => /^R7 .*cooling-off/i.test(r));
    if (coolingOff && approval?.approvedAt && !approval.cancelledAt) {
      await ctx.runMutation(internal.cases.update, { caseId, status: "AWAITING_OWNER" });
      if (approval.coolingOffUntil) {
        await ctx.scheduler.runAt(approval.coolingOffUntil + 250, internal.pipeline.advance, { caseId });
        await reply();
      }
      return;
    }

    // 4f. Final: BLOCK, terminal HOLD, NO_ACTION.
    if (result.firedRules.includes("R10")) {
      await ctx.runMutation(internal.cases.markSenderKnownBad, { caseId });
    }
    await finish(result);
  },
});
