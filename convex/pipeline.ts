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
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { decide } from "../shared/policy/engine";
import { DEMO_POLICY, LIMITS } from "../shared/config";
import type {
  ApprovalState,
  CallbackOutcome,
  CaseStatus,
  Decision,
  InvoiceRecord,
  PaymentRequest,
  PolicyResult,
  RiskFindings,
  VendorFindings,
  VendorRecord,
} from "../shared/types";
import { withAgentRun } from "./lib/withAgentRun";
import { appendAudit } from "./audit";
import { templateReply } from "../shared/reply";
import { composeReply } from "./lib/claude";
import { EMPTY_REQUEST, runIntake, summarizeIntake } from "./agents/intake";
import { runVendorVerifier } from "./agents/vendorVerifier";
import { crsLaneText } from "../shared/verification/crs";
import { authBadge } from "../shared/email/auth";
import type { EmailSignals } from "../shared/email/inbound";
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

/** One line for the Vendor Verifier's War Room lane, e.g. "Vendor matched (0.95) · sender not on file · new bank ≠ file · invoice found". */
function summarizeVendor(f: VendorFindings): string {
  const crs = crsLaneText(f.crs);
  if (!f.vendorId) return ["No vendor match in the vendor book", emailLaneText(f.emailAuth), crs].filter(Boolean).join(" · ");
  const parts = [`Vendor matched (${f.matchConfidence.toFixed(2)})`];
  const email = emailLaneText(f.emailAuth);
  if (email) parts.push(email);
  parts.push(f.senderOnFile ? "sender on file" : "sender not on file");
  if (f.bankMatches === false) parts.push("new bank ≠ file");
  else if (f.bankMatches === true) parts.push("bank matches file");
  parts.push(f.alreadyPaidAt != null ? "invoice already paid" : f.matchingInvoiceId ? "invoice found" : "no matching invoice");
  if (f.ofacHit) parts.push("OFAC HIT");
  if (crs) parts.push(crs);
  return parts.join(" · ");
}

/** "email authenticated", "FORGED sender: failed DMARC", "replies go to x.example": what R17 will read. */
function emailLaneText(a: VendorFindings["emailAuth"]): string | null {
  if (!a) return null;
  const parts = [
    a.spoofsOnFile
      ? `FORGED sender (${authBadge(a)})`
      : a.verdict === "pass"
        ? "email authenticated"
        : a.verdict === "fail"
          ? `email failed authentication (${authBadge(a)})`
          : "email sender unverified",
  ];
  if (a.replyToDomain) parts.push(`replies go to ${a.replyToDomain}`);
  if (a.displayNameClaims) parts.push(`display name poses as ${a.displayNameClaims}`);
  return parts.join(" · ");
}

/** Non-payment messages worth the owner's attention. Greetings and spam are filtered. */
function forwardsToOwner(req: PaymentRequest): boolean {
  return !!req.messageType && req.messageType !== "payment" && req.messageType !== "sales_or_spam";
}

/** One line for the Risk Analyst's War Room lane, e.g. "Risk 72 · bank_change, urgency". */
function summarizeRisk(r: RiskFindings): string {
  return `Risk ${r.riskScore} · ${r.flags.length ? r.flags.join(", ") : "no red flags"}`;
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
  args: { caseId: v.id("cases"), restarts: v.optional(v.number()) },
  handler: async (ctx, { caseId, restarts }) => {
    const loaded = await ctx.runQuery(internal.pipeline.loadContext, { caseId });
    if (!loaded || loaded.c.status === "CLOSED") return;
    const { c, owner } = loaded;
    // If this run dies (an uncaught error inside an SDK, an action timeout), the watchdog restarts it.
    await ctx.scheduler.runAfter(WATCHDOG_MS, internal.pipeline.watchdog, { caseId, restarts: restarts ?? 0 });
    const biz = { ownerName: owner?.name ?? "the owner", company: owner?.company ?? "this business" };

    // 1. Intake
    let request = c.request as PaymentRequest | undefined;
    if (!request) {
      request =
        (await safely(() =>
          withAgentRun(ctx, caseId, "intake", () => runIntake(ctx, c, owner), (r) =>
            (c.emailSignals as EmailSignals | undefined)?.pdf ? `${summarizeIntake(r)} · read the attached PDF` : summarizeIntake(r),
          ),
        )) ??
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
        vendorFindings ??
          safely(() => withAgentRun(ctx, caseId, "vendorVerifier", () => runVendorVerifier(ctx, c, req), summarizeVendor)),
        riskFindings ??
          safely(() => withAgentRun(ctx, caseId, "riskAnalyst", () => runRiskAnalyst(ctx, c, req), summarizeRisk)),
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

    // Writes the reply in the same update as the new status/decision, so no one ever sees a closed
    // case with the previous reply, then sends it on the request's channel.
    const settle = async (
      patch: { status?: CaseStatus; decision?: Decision },
      { paymentSent = false, callbackInProgress = false, decided = result }: { paymentSent?: boolean; callbackInProgress?: boolean; decided?: PolicyResult } = {},
    ) => {
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
          messageType: req.messageType,
        },
        summary: req.summary,
      });
      await ctx.runMutation(internal.cases.update, { caseId, ...patch, replyText: text, actor: `leader:${source}` });
      await ctx.scheduler.runAfter(0, internal.channels.reply.dispatch, { caseId });
    };

    const finish = async (decided: PolicyResult, paymentSent = false) => {
      await settle({ decision: decided.decision, status: "CLOSED" }, { paymentSent, decided });
      if (decided.decision !== "NO_ACTION") {
        await ctx.scheduler.runAfter(0, internal.agents.ownerConcierge.notifyOwner, {
          caseId,
          text: `${decided.decision} (${decided.firedRules.join(", ")}): ${decided.reasons.join("; ")}`,
        });
      } else if (forwardsToOwner(req)) {
        // Not a payment, but something the owner should see: a meeting request, a question, a vendor's news.
        await ctx.scheduler.runAfter(0, internal.agents.ownerConcierge.notifyOwner, {
          caseId,
          text: `Message (${(req.messageType ?? "other").replace("_", " ")}): ${req.summary ?? c.rawContent.slice(0, 160)}`,
        });
      }
    };

    // 4. Act on the result

    // 4a. Callback needed and not placed yet / still ringing.
    if (result.needs.callback) {
      if (!latestCallback) {
        await ctx.scheduler.runAfter(0, internal.agents.callbackVerifier.start, { caseId });
        await settle({ status: "CALLBACK_PENDING" }, { callbackInProgress: true });
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
      // The bank update runs after the lock, so a failure here must close the case like a Payer failure
      // would; a throw would leave it locked in AWAITING_OWNER forever.
      const bankUpdated = result.firedRules.includes("R2")
        ? await safely(async () => (await ctx.runMutation(internal.cases.applyConfirmedBankChange, { caseId }), true))
        : true;
      const fresh = await ctx.runQuery(internal.cases.get, { caseId });
      const paid = bankUpdated
        ? await safely(() =>
            withAgentRun(ctx, caseId, "payer", () => runPayer(ctx, fresh ?? c), (p) => (p.ok ? (p.summary ?? `Paid: ${p.externalId}`) : `Failed: ${p.error}`)),
          )
        : { ok: false as const, error: "the new bank details could not be saved" };
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
      if (!approval) {
        // Status first: the owner page lists AWAITING_OWNER cases, and the alert must not arrive before
        // the case shows there. The requester's reply (a Claude call) follows.
        await ctx.runMutation(internal.cases.update, { caseId, status: "AWAITING_OWNER" });
        await ctx.scheduler.runAfter(0, internal.agents.ownerConcierge.requestApproval, { caseId });
        await settle({});
      } else {
        await ctx.runMutation(internal.cases.update, { caseId, status: "AWAITING_OWNER" });
      }
      return; // ownerConcierge re-runs advance on approval
    }

    // 4e. Approved, cooling-off running: wake up when it ends (the owner can still cancel).
    const coolingOff = result.decision === "HOLD" && result.reasons.some((r) => /^R7 .*cooling-off/i.test(r));
    if (coolingOff && approval?.approvedAt && !approval.cancelledAt) {
      if (approval.coolingOffUntil) {
        await ctx.scheduler.runAt(approval.coolingOffUntil + 250, internal.pipeline.advance, { caseId });
        await settle({ status: "AWAITING_OWNER" });
      } else {
        await ctx.runMutation(internal.cases.update, { caseId, status: "AWAITING_OWNER" });
      }
      return;
    }

    // 4f. Final: BLOCK, terminal HOLD, NO_ACTION.
    // The bank's own change request isn't a scammer's address, so it never goes on the known-bad list.
    if (result.firedRules.includes("R10") && c.channel !== "bank") {
      await ctx.runMutation(internal.cases.markSenderKnownBad, { caseId });
    }
    await finish(result);
  },
});

// ---- Watchdog ----
// A pipeline run can die without reaching any catch block: an SDK throwing from inside a timer, an
// action timeout, a deploy mid-run. advance is idempotent, so the watchdog simply runs it again.
// Waiting states (CALLBACK_PENDING, AWAITING_OWNER) and CLOSED are left alone.
export const WATCHDOG_MS = 100_000;
// Longer than the slowest healthy run (two intake attempts, the reply, two Payer tries: ~60 s), so a
// restart only ever follows a dead run and never races a slow one.
const STALL_MS = 90_000;
const MAX_RESTARTS = 2;
const IN_FLIGHT = new Set<CaseStatus>(["RECEIVED", "PARSED", "VERIFYING", "DECIDED"]);

export const watchdog = internalMutation({
  args: { caseId: v.id("cases"), restarts: v.number() },
  handler: async (ctx, { caseId, restarts }) => {
    const c = await ctx.db.get(caseId);
    if (!c || !IN_FLIGHT.has(c.status)) return;
    if (Date.now() - c.updatedAt < STALL_MS) {
      // Still making progress (or a newer run is): look again later.
      await ctx.scheduler.runAfter(WATCHDOG_MS, internal.pipeline.watchdog, { caseId, restarts });
      return;
    }
    if (restarts < MAX_RESTARTS) {
      await appendAudit(ctx, { caseId, actor: "system", action: "pipeline.restarted", payload: { status: c.status, restarts: restarts + 1 } });
      await ctx.db.patch(caseId, { updatedAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.pipeline.advance, { caseId, restarts: restarts + 1 });
      return;
    }
    // Out of restarts: close as HOLD. Nothing was paid (PAY only happens inside a successful run).
    const held: PolicyResult = {
      decision: "HOLD",
      firedRules: ["R14"],
      reasons: [`R14 Cannot verify: the pipeline stopped ${restarts + 1} times in ${c.status}`],
      needs: { callback: false, ownerOtp: false, coolingOffSeconds: 0 },
      overridable: true,
    };
    const replyText = templateReply(held, {
      company: "this business",
      vendorName: null,
      invoiceNumber: null,
      paymentSent: false,
      callbackInProgress: false,
    });
    await ctx.db.patch(caseId, { status: "CLOSED", decision: "HOLD", policyResult: held, replyText, updatedAt: Date.now() });
    await appendAudit(ctx, { caseId, actor: "system", action: "pipeline.gave_up", payload: { status: c.status, restarts } });
    await ctx.scheduler.runAfter(0, internal.channels.reply.dispatch, { caseId });
    await ctx.scheduler.runAfter(0, internal.agents.ownerConcierge.notifyOwner, { caseId, text: `HOLD (R14): ${held.reasons[0]}` });
  },
});
