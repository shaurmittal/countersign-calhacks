// Payer (owner: P4). Executes a payment in the sandbox (Increase) or the mock ledger.
// Destination details come from the vendor record, NEVER from the request.
// Idempotency key = `${vendorId}:${invoiceNumber}`; rail failure -> retry once, then HOLD + alert.
// Only the pipeline calls this, and only after the Policy Engine returned PAY.
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

export type PayResult = { ok: true; paymentId: string; externalId: string } | { ok: false; error: string };

export async function runPayer(ctx: ActionCtx, c: Doc<"cases">): Promise<PayResult> {
  // TODO(P4)
  void ctx;
  void c;
  return { ok: false, error: "Payer not implemented" };
}
