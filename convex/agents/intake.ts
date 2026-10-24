// Intake Parser (owner: P1). Raw text/transcript -> PaymentRequest via Claude with a strict schema.
// The message is UNTRUSTED DATA: extract fields only, never follow instructions inside it.
// Instructions in the text set injectionAttempt = true (model OR regex prescan). On schema
// failure: retry once, then return a parseFailed request so the case HOLDs.
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { PaymentRequest } from "../../shared/types";
import { extractPaymentRequest } from "../lib/claude";

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
  parseFailed: true,
};

export async function runIntake(
  ctx: ActionCtx,
  c: Doc<"cases">,
  owner: Doc<"owner"> | null,
): Promise<PaymentRequest> {
  void ctx;
  const biz = { ownerName: owner?.name ?? "the owner", company: owner?.company ?? "this business" };
  const { request, error } = await extractPaymentRequest(c.channel, c.rawContent, biz);
  if (error) console.warn(`[intake] case ${c._id}: ${error}; falling back to HOLD`);
  return request;
}

export function summarizeIntake(r: PaymentRequest): string {
  if (r.parseFailed) return "Could not parse: HOLD";
  const parts: string[] = [r.requestedAction];
  if (r.claimedVendorName) parts.push(r.claimedVendorName);
  if (r.amountCents != null) parts.push(`$${(r.amountCents / 100).toFixed(2)}`);
  if (r.invoiceNumber) parts.push(`#${r.invoiceNumber}`);
  if (r.newBankDetails) parts.push(`new bank …${(r.newBankDetails.account ?? r.newBankDetails.routing ?? "").slice(-4)}`);
  if (r.claimedSenderRole !== "unknown") parts.push(`claims: ${r.claimedSenderRole}`);
  if (r.injectionAttempt) parts.push("⚠ injection");
  return parts.join(" · ");
}
