// Owner Concierge (owner: P4). Spec §6.5.
// Step-up approval: a 6-digit code from the owner's authenticator app (TOTP, shared/totp.ts),
// entered on /owner or sent in ASI:One. Nothing is sent over SMS or voice, and a voice is never
// an approval. A request that arrived over the agent channel cannot be approved in ASI:One,
// because that is the same channel.
//
// Contract with the pipeline:
//   pipeline schedules  internal.agents.ownerConcierge.requestApproval({ caseId })
//   approve / decline / cancel update the approvals row, then schedule internal.pipeline.advance.
//   Approve sets coolingOffUntil from policyResult.needs.coolingOffSeconds; the Policy Engine
//   holds until then and the pipeline schedules its own wake-up. Cancel works until it pays.
//   pipeline schedules  internal.agents.ownerConcierge.notifyOwner({ caseId, text }) on close.
import { v } from "convex/values";
import { internalMutation, mutation, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { finishRun, startRun } from "../agentRuns";
import { appendAudit } from "../audit";
import { latestApproval, summarizeCase } from "../lib/caseView";
import { formatCents } from "../../shared/ledger";
import { checkTotp, describeRejection } from "../../shared/totp";

const MAX_WRONG_CODES = 5;
const LOCKOUT_MS = 60_000;

export const ownerAction = v.union(v.literal("approve"), v.literal("decline"), v.literal("cancel"));
type OwnerAction = "approve" | "decline" | "cancel";
type ApprovalMethod = Doc<"approvals">["method"];

/** Returned, not thrown: a throw would roll back the wrong-code counter and defeat the lockout. */
export type OwnerCodeResult = { ok: true; message: string } | { ok: false; error: string };

export const requestApproval = internalMutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.db.get(caseId);
    if (!c || c.status === "CLOSED") return;
    if (await latestApproval(ctx, caseId)) return; // already asked; the pipeline may re-run

    await ctx.db.insert("approvals", { caseId, method: "otp", requestedAt: Date.now(), attempts: 0 });
    await appendAudit(ctx, { caseId, actor: "ownerConcierge", action: "approval.requested" });
    // The lane stays "running" while Countersign waits for the owner; applyOwnerCode finishes it.
    await startRun(ctx, { caseId, agent: "ownerConcierge" });
    await notify(ctx, caseId, `Approval needed: ${await describe(ctx, c)}. Enter the code from your authenticator app on /owner.`);
  },
});

export const notifyOwner = internalMutation({
  args: { caseId: v.id("cases"), text: v.string() },
  handler: (ctx, { caseId, text }) => notify(ctx, caseId, text),
});

/** The owner page. The code proves the owner holds the registered authenticator. */
export const submitCode = mutation({
  args: { caseId: v.id("cases"), code: v.string(), action: ownerAction },
  handler: (ctx, args): Promise<OwnerCodeResult> => applyOwnerCode(ctx, { ...args, method: "otp" }),
});

/** ASI:One, via the authenticated agent bridge. Same code check. */
export const submitCodeFromAgent = internalMutation({
  args: { caseId: v.id("cases"), code: v.string(), action: ownerAction },
  handler: (ctx, args): Promise<OwnerCodeResult> => applyOwnerCode(ctx, { ...args, method: "asi_one" }),
});

async function applyOwnerCode(
  ctx: MutationCtx,
  args: { caseId: Id<"cases">; code: string; action: OwnerAction; method: ApprovalMethod },
): Promise<OwnerCodeResult> {
  const { caseId, action, method } = args;
  const now = Date.now();
  const c = await ctx.db.get(caseId);
  if (!c) return fail("Unknown case.");
  if (c.status === "CLOSED") return fail("This case is already closed.");
  if (method === "asi_one" && c.channel === "agent") {
    return fail("This request came in over the agent channel, so it can't be approved there. Use the owner page.");
  }
  const approval = await latestApproval(ctx, caseId);
  if (!approval) return fail("This case is not waiting for your approval.");

  const notAllowed = actionNotAllowed(c, approval, action, now);
  if (notAllowed) return fail(notAllowed);
  if (approval.lockedUntil && approval.lockedUntil > now) {
    return fail(`Too many wrong codes. Try again in ${Math.ceil((approval.lockedUntil - now) / 1000)}s.`);
  }

  const secret = process.env.OWNER_TOTP_SECRET;
  if (!secret) return fail("Owner codes are not set up on this deployment (OWNER_TOTP_SECRET).");
  const owner = await ctx.db.query("owner").first();
  const check = checkTotp({ secretBase32: secret, code: args.code, now, lastCounter: owner?.lastTotpCounter });
  if (!check.ok) {
    if (check.reason !== "malformed") await recordWrongCode(ctx, approval, method, check.reason, now);
    return fail(describeRejection(check.reason));
  }
  if (owner) await ctx.db.patch(owner._id, { lastTotpCounter: check.counter });

  const message = await applyAction(ctx, c, approval, action, method, now);
  await ctx.scheduler.runAfter(0, internal.pipeline.advance, { caseId });
  return { ok: true, message };
}

function actionNotAllowed(c: Doc<"cases">, approval: Doc<"approvals">, action: OwnerAction, now: number): string | null {
  if (approval.cancelledAt) return "This payment was already declined.";
  if (action !== "cancel") return approval.approvedAt ? "You already approved this payment." : null;

  if (!approval.approvedAt) return "Nothing to cancel yet. Decline it instead.";
  if (!approval.coolingOffUntil || approval.coolingOffUntil <= now) return "The cooling-off period is over.";
  // cases.claimPayment sets payStartedAt atomically before the Payer runs.
  return c.payStartedAt ? "The payment is already being sent." : null;
}

async function recordWrongCode(
  ctx: MutationCtx,
  approval: Doc<"approvals">,
  method: ApprovalMethod,
  reason: string,
  now: number,
) {
  const attempts = (approval.attempts ?? 0) + 1;
  const locked = attempts >= MAX_WRONG_CODES;
  await ctx.db.patch(approval._id, {
    attempts: locked ? 0 : attempts,
    lockedUntil: locked ? now + LOCKOUT_MS : approval.lockedUntil,
  });
  await appendAudit(ctx, {
    caseId: approval.caseId,
    actor: "ownerConcierge",
    action: "approval.code_rejected",
    payload: { method, reason, attempts, lockedForSeconds: locked ? LOCKOUT_MS / 1000 : 0 },
  });
}

async function applyAction(
  ctx: MutationCtx,
  c: Doc<"cases">,
  approval: Doc<"approvals">,
  action: OwnerAction,
  method: ApprovalMethod,
  now: number,
): Promise<string> {
  const via = method === "otp" ? "authenticator code" : "ASI:One + authenticator code";
  if (action === "approve") {
    const { coolingOffSeconds } = await summarizeCase(ctx, c);
    const coolingOffUntil = coolingOffSeconds > 0 ? now + coolingOffSeconds * 1000 : undefined;
    await ctx.db.patch(approval._id, { method, approvedAt: now, coolingOffUntil, attempts: 0 });
    await appendAudit(ctx, { caseId: c._id, actor: "owner", action: "approval.approved", payload: { method, coolingOffUntil } });
    const summary = coolingOffUntil ? `Approved via ${via} · cooling-off ${coolingOffSeconds}s` : `Approved via ${via}`;
    await finishLane(ctx, c._id, summary);
    const message = coolingOffUntil
      ? `Approved. The payment is released in ${coolingOffSeconds}s unless you cancel.`
      : "Approved. Countersign is releasing the payment.";
    await notify(ctx, c._id, message);
    return message;
  }

  await ctx.db.patch(approval._id, { method, cancelledAt: now });
  const verb = action === "decline" ? "declined" : "cancelled";
  await appendAudit(ctx, { caseId: c._id, actor: "owner", action: `approval.${verb}`, payload: { method } });
  const lane = verb === "declined" ? "Declined by the owner" : "Cancelled by the owner during cooling-off";
  await finishLane(ctx, c._id, `${lane} via ${via}`);
  const message = `${verb === "declined" ? "Declined" : "Cancelled"}. Nothing will be paid.`;
  await notify(ctx, c._id, message);
  return message;
}

/** Finishes the "waiting for owner" lane run; a cancel after approval gets a run of its own. */
async function finishLane(ctx: MutationCtx, caseId: Id<"cases">, summary: string) {
  const runs = await ctx.db.query("agentRuns").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
  const waiting = runs.find((r) => r.agent === "ownerConcierge" && r.status === "running");
  await finishRun(ctx, waiting?._id ?? (await startRun(ctx, { caseId, agent: "ownerConcierge" })), { summary });
}

/** Owner alerts are audit events; the owner page and the ASI:One agent read them from there. */
async function notify(ctx: MutationCtx, caseId: Id<"cases">, text: string) {
  await appendAudit(ctx, { caseId, actor: "ownerConcierge", action: "owner.notified", payload: { text } });
}

async function describe(ctx: MutationCtx, c: Doc<"cases">): Promise<string> {
  const s = await summarizeCase(ctx, c);
  const amount = s.amountCents != null ? formatCents(s.amountCents) : "unknown amount";
  const rules = s.firedRules.length ? ` (${s.firedRules.join(", ")})` : "";
  return `${s.vendorName ?? "unknown payee"} · ${amount}${rules}`;
}

function fail(error: string): OwnerCodeResult {
  return { ok: false, error };
}
