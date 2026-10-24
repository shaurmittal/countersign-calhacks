// Payer (owner: P4). Executes a payment on the mock ledger, or in the Increase sandbox when
// INCREASE_API_KEY is set. Destination details come from the vendor record (payments.begin),
// NEVER from the request. Idempotency key = `${vendorId}:${invoiceNumber}`, also sent to Increase.
// Rail failure: retry once, then the payment is marked failed and the pipeline HOLDs and alerts
// the owner. A configured Increase rail never silently falls back to the mock ledger.
// Only the pipeline calls this, and only after the Policy Engine returned PAY.
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { increaseConfigured, increaseRequest, IncreaseError, withOneRetry } from "../lib/increase";
import type { PaymentPlan } from "../payments";

export type PayResult = { ok: true; paymentId: string; externalId: string } | { ok: false; error: string };

type SendablePlan = Extract<PaymentPlan, { ok: true }>;

/**
 * The demo world only stores each vendor's routing number and the last 4 of the account, so the
 * sandbox external account uses a stand-in account number that ends in those same 4 digits.
 */
const SANDBOX_ACCOUNT_PREFIX = "880000";

export async function runPayer(ctx: ActionCtx, c: Doc<"cases">): Promise<PayResult> {
  const plan = await ctx.runMutation(internal.payments.begin, {
    caseId: c._id,
    rail: increaseConfigured() ? "ach_sandbox" : "mock",
  });
  if (!plan.ok) return plan;

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
