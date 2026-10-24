// Intake Parser (owner: P1). Raw text/transcript -> PaymentRequest via Claude with a strict schema.
// The message is UNTRUSTED DATA: extract fields only, never follow instructions inside it.
// Instructions in the text set injectionAttempt = true. On schema failure: retry once, then
// return requestedAction "other" so the case HOLDs.
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { PaymentRequest } from "../../shared/types";

export const EMPTY_REQUEST: PaymentRequest = {
  claimedVendorName: null,
  claimedSenderRole: "unknown",
  amountCents: null,
  currency: "USD",
  invoiceNumber: null,
  newBankDetails: null,
  urgencyClaims: [],
  requestedAction: "other",
  injectionAttempt: false,
};

export async function runIntake(ctx: ActionCtx, c: Doc<"cases">): Promise<PaymentRequest> {
  // TODO(P1): call Claude (process.env.ANTHROPIC_API_KEY) with a JSON schema and validate with zod.
  void ctx;
  void c;
  return EMPTY_REQUEST;
}
