// Countersign leader (owner: P1). Spec §6.6.
// `advance` is an idempotent step function: it looks at what the case already has, runs the
// next missing step, asks the Policy Engine, and acts on the result. It is re-run whenever an
// external event lands (callback outcome, owner approval, cooling-off timer).
//
//   RECEIVED → PARSED → VERIFYING → (CALLBACK_PENDING) → DECIDED → (AWAITING_OWNER) → CLOSED
//
// Models read, reason and propose. Only decide() (shared/policy/engine.ts) can return PAY,
// and only the PAY branch below calls the Payer.
import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { decide } from "../shared/policy/engine";
import { DEMO_POLICY } from "../shared/config";
import type {
  ApprovalState,
  PaymentRequest,
  PolicyResult,
  RiskFindings,
  VendorFindings,
  VendorRecord,
} from "../shared/types";
import { withAgentRun } from "./lib/withAgentRun";
import { runIntake } from "./agents/intake";
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
    const callback = await ctx.db
      .query("callbacks")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .order("desc")
      .first();
    const approval = await ctx.db
      .query("approvals")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .order("desc")
      .first();
    return { c, owner, vendor, callback, approval };
  },
});

function toVendorRecord(vendor: Doc<"vendors"> | null): VendorRecord | null {
  if (!vendor) return null;
  const [min, max] = vendor.typicalAmountRange;
  return { id: vendor._id, name: vendor.name, typicalAmountRange: [min, max], alwaysEscalate: vendor.alwaysEscalate };
}

function toApproval(a: Doc<"approvals"> | null): ApprovalState | null {
  if (!a) return null;
  return { method: a.method, approved: !!a.approvedAt && !a.cancelledAt, coolingOffUntil: a.coolingOffUntil ?? null };
}

// TODO(P1): have Claude write a polite, firm reply from the PolicyResult (never promising payment).
function composeReply(result: PolicyResult): string {
  switch (result.decision) {
    case "PAY":
      return "Thanks, this payment has been approved and sent.";
    case "BLOCK":
      return "We can't make this payment. The business owner has been notified.";
    case "NO_ACTION":
      return "Hi! This is Countersign, the payments assistant for this business. Send a payment request and we'll verify it.";
    default:
      return "We've received your request and are verifying it before any payment is made.";
  }
}

export const advance = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const loaded = await ctx.runQuery(internal.pipeline.loadContext, { caseId });
    if (!loaded || loaded.c.status === "CLOSED") return;
    let { c } = loaded;
    const { owner, callback, approval } = loaded;

    // 1. Intake
    let request = c.request as PaymentRequest | undefined;
    if (!request) {
      request = await withAgentRun(ctx, caseId, "intake", () => runIntake(ctx, c), (r) => `Action: ${r.requestedAction}`);
      await ctx.runMutation(internal.cases.update, { caseId, request, status: "PARSED", actor: "intake" });
    }

    // 2. Vendor Verifier + Risk Analyst in parallel
    let vendorFindings = c.vendorFindings as VendorFindings | undefined;
    let riskFindings = c.riskFindings as RiskFindings | undefined;
    if (request.requestedAction !== "none" && (!vendorFindings || !riskFindings)) {
      await ctx.runMutation(internal.cases.update, { caseId, status: "VERIFYING" });
      const req = request;
      [vendorFindings, riskFindings] = await Promise.all([
        withAgentRun(ctx, caseId, "vendorVerifier", () => runVendorVerifier(ctx, c, req)),
        withAgentRun(ctx, caseId, "riskAnalyst", () => runRiskAnalyst(ctx, c, req)),
      ]);
      await ctx.runMutation(internal.cases.update, {
        caseId,
        vendorFindings,
        riskFindings,
        vendorId: (vendorFindings.vendorId ?? undefined) as Doc<"cases">["vendorId"],
        riskScore: riskFindings.riskScore,
        flags: riskFindings.flags,
      });
    }

    // 3. Policy Engine (deterministic)
    const reloaded = await ctx.runQuery(internal.pipeline.loadContext, { caseId });
    if (!reloaded) return;
    c = reloaded.c;
    const req = request;
    const result: PolicyResult =
      req.requestedAction === "none"
        ? {
            decision: "NO_ACTION",
            firedRules: [],
            reasons: ["No payment requested"],
            needs: { callback: false, ownerOtp: false, coolingOffSeconds: 0 },
            overridable: true,
          }
        : await withAgentRun(
            ctx,
            caseId,
            "policy",
            async () =>
              decide({
                request: req,
                vendor: toVendorRecord(reloaded.vendor),
                vendorFindings: vendorFindings ?? null,
                riskFindings: riskFindings ?? null,
                callbackOutcome: callback?.outcome ?? null,
                approval: toApproval(approval),
                policy: owner?.policy ?? DEMO_POLICY,
                now: Date.now(),
              }),
            (r) => `${r.decision} ${r.firedRules.join(" ")}`.trim(),
          );
    await ctx.runMutation(internal.cases.update, { caseId, policyResult: result, actor: "policy" });

    // 4. Act on the result
    if (result.needs.callback && !callback?.outcome) {
      if (!callback) await ctx.scheduler.runAfter(0, internal.agents.callbackVerifier.start, { caseId });
      await ctx.runMutation(internal.cases.update, { caseId, status: "CALLBACK_PENDING" });
      return; // recordOutcome re-runs advance
    }

    if (result.decision === "PAY") {
      const paid = await withAgentRun(ctx, caseId, "payer", () => runPayer(ctx, c), (p) =>
        p.ok ? `Paid: ${p.externalId}` : `Failed: ${p.error}`,
      );
      const decision = paid.ok ? "PAY" : "HOLD";
      await finish(decision, composeReply({ ...result, decision }));
      return;
    }

    if (result.needs.ownerOtp && !approval) {
      await ctx.scheduler.runAfter(0, internal.agents.ownerConcierge.requestApproval, { caseId });
      await ctx.runMutation(internal.cases.update, { caseId, decision: result.decision, status: "AWAITING_OWNER" });
      await reply(composeReply(result));
      return; // approval / cooling-off timer re-runs advance
    }

    await finish(result.decision, composeReply(result));

    async function reply(text: string) {
      await ctx.runMutation(internal.cases.update, { caseId, replyText: text });
      await ctx.scheduler.runAfter(0, internal.channels.reply.dispatch, { caseId });
    }

    async function finish(decision: PolicyResult["decision"], text: string) {
      await ctx.runMutation(internal.cases.update, { caseId, decision, status: "CLOSED" });
      await reply(text);
      if (decision !== "NO_ACTION") {
        await ctx.scheduler.runAfter(0, internal.agents.ownerConcierge.notifyOwner, {
          caseId,
          text: `${decision}: ${result.reasons.join("; ")}`,
        });
      }
    }
  },
});
