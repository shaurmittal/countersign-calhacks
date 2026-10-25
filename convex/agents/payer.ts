// Payer (owner: P4; Lumen Bank rail: P1). By default every payment goes through Lumen Bank as a
// countersigned release: signRelease (convex/lib/countersign.ts) signs exactly this transfer and the
// bank (convex/bank.ts) refuses anything that doesn't verify. No signing key, no payment (fails closed).
// PAYMENT_RAIL=ach_sandbox uses the Increase sandbox directly; PAYMENT_RAIL=mock the mock ledger.
// Destination details come from the vendor record (payments.begin),
// NEVER from the request. Idempotency key = `${vendorId}:${invoiceNumber}`, also sent to Increase.
// Rail failure: retry once, then the payment is marked failed and the pipeline HOLDs and alerts
// the owner. A configured Increase rail never silently falls back to the mock ledger.
// Only the pipeline calls this, and only after the Policy Engine returned PAY.
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { increaseConfigured, increaseRequest, IncreaseError, withOneRetry } from "../lib/increase";
import { signRelease } from "../lib/countersign";
import type { PaymentPlan } from "../payments";
import type { PolicyResult } from "../../shared/types";
import type { PaymentRail } from "../../shared/ledger";

export type PayResult =
  | { ok: true; paymentId: string; externalId: string; summary?: string }
  | { ok: false; error: string };

function chosenRail(): PaymentRail {
  const rail = process.env.PAYMENT_RAIL;
  if (rail === "mock") return "mock";
  if (rail === "ach_sandbox" && increaseConfigured()) return "ach_sandbox";
  return "lumen_bank";
}

type SendablePlan = Extract<PaymentPlan, { ok: true }>;

/**
 * The demo world only stores each vendor's routing number and the last 4 of the account, so the
 * sandbox external account uses a stand-in account number that ends in those same 4 digits.
 */
const SANDBOX_ACCOUNT_PREFIX = "880000";

export async function runPayer(ctx: ActionCtx, c: Doc<"cases">): Promise<PayResult> {
  const plan = await ctx.runMutation(internal.payments.begin, { caseId: c._id, rail: chosenRail() });
  if (!plan.ok) return plan;

  if (plan.rail === "lumen_bank") return payThroughLumenBank(ctx, c, plan);

  if (plan.rail === "mock") {
    const externalId = `mock_${plan.paymentId}`;
    await ctx.runMutation(internal.payments.markSent, { paymentId: plan.paymentId, externalId });
    return { ok: true, paymentId: plan.paymentId, externalId };
  }

  try {
    const externalId = await sendAchTransfer(plan);
    await ctx.runMutation(internal.payments.markSent, { paymentId: plan.paymentId, externalId });
    return { ok: true, paymentId: plan.paymentId, externalId };
  } catch (err) {
    // Never leave the row pending: that would block every later attempt on this invoice.
    const error = err instanceof Error ? err.message : String(err);
    await ctx.runMutation(internal.payments.markFailed, { paymentId: plan.paymentId, error });
    if (!(err instanceof IncreaseError)) throw err;
    return { ok: false, error };
  }
}

async function sendAchTransfer(plan: SendablePlan): Promise<string> {
  const accountId = process.env.INCREASE_ACCOUNT_ID;
  if (!accountId) throw new IncreaseError("INCREASE_ACCOUNT_ID is not set (run payments:provisionIncrease)", false);

  // Keyed on the bank details themselves, so an approved bank change gets its own account.
  const destination = await withOneRetry(() =>
    increaseRequest<{ id: string }>("POST", "/external_accounts", {
      idempotencyKey: `countersign-ext-${plan.bankRouting}-${plan.bankLast4}`,
      body: {
        routing_number: plan.bankRouting,
        account_number: `${SANDBOX_ACCOUNT_PREFIX}${plan.bankLast4}`,
        description: `Countersign payee ending ${plan.bankLast4}`,
        account_holder: "business",
        funding: "checking",
      },
    }),
  );

  const transfer = await withOneRetry(() =>
    increaseRequest<{ id: string; status: string }>("POST", "/ach_transfers", {
      idempotencyKey: `countersign-pay-${plan.idempotencyKey}`,
      body: {
        account_id: accountId,
        amount: plan.amountCents,
        external_account_id: destination.id,
        statement_descriptor: `Invoice ${plan.invoiceNumber}`,
      },
    }),
  );
  return transfer.id;
}

/** Countersign this exact transfer, then ask Lumen Bank to execute it. The bank decides, not us. */
async function payThroughLumenBank(ctx: ActionCtx, c: Doc<"cases">, plan: SendablePlan): Promise<PayResult> {
  let release;
  try {
    release = await signRelease(plan, c.policyResult as PolicyResult | undefined);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await ctx.runMutation(internal.payments.markFailed, { paymentId: plan.paymentId, error });
    return { ok: false, error };
  }
  const result = await ctx.runMutation(internal.bank.transfer, {
    payload: release.payload,
    signature: release.signature,
    source: "countersign",
  });
  if (result.status === "accepted") {
    const externalId = `lumen_${result.transferId}`;
    await ctx.runMutation(internal.payments.markSent, { paymentId: plan.paymentId, externalId });
    return { ok: true, paymentId: plan.paymentId, externalId, summary: `Paid via Lumen Bank · countersigned · sig ${release.signatureHash.slice(0, 4)}…` };
  }
  const error = result.status === "rejected" ? `Lumen Bank refused: ${result.reason}` : "Lumen Bank refused: rate limited";
  await ctx.runMutation(internal.payments.markFailed, { paymentId: plan.paymentId, error });
  return { ok: false, error };
}
