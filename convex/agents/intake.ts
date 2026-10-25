// Intake Parser (owner: P1). Raw text/transcript -> PaymentRequest via Claude with a strict schema.
// The message is UNTRUSTED DATA: extract fields only, never follow instructions inside it.
// Instructions in the text set injectionAttempt = true (model OR regex prescan). On schema
// failure: retry once, then return a parseFailed request so the case HOLDs.
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { PaymentRequest } from "../../shared/types";
import { extractPaymentRequest, type IntakeDocument } from "../lib/claude";
import type { EmailSignals } from "../../shared/email/inbound";

/** The emailed PDF (convex/channels/email.ts stored it), base64 for Claude. null when there is none. */
async function attachedPdf(ctx: ActionCtx, c: Doc<"cases">): Promise<IntakeDocument | null> {
  const pdf = (c.emailSignals as EmailSignals | undefined)?.pdf;
  if (c.channel !== "email" || !pdf?.storageId) return null;
  const blob = await ctx.storage.get(pdf.storageId as Id<"_storage">);
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { name: pdf.name, base64: btoa(binary) };
}

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
  const biz = { ownerName: owner?.name ?? "the owner", company: owner?.company ?? "this business" };
  const document = await attachedPdf(ctx, c);
  const { request, error } = await extractPaymentRequest(c.channel, c.rawContent, biz, document ?? undefined);
  if (error) console.warn(`[intake] case ${c._id}: ${error}; falling back to HOLD`);
  return request;
}

export function summarizeIntake(r: PaymentRequest): string {
  if (r.parseFailed) return "Could not parse: HOLD";
  // Not a payment: what it is and what they want ("meeting · Heechan asks for a chat tomorrow morning").
  if (r.requestedAction === "none" && r.messageType && r.messageType !== "payment") {
    const parts = [r.messageType.replace("_", " ")];
    if (r.summary) parts.push(r.summary);
    if (r.sensitiveAsk) parts.push(`⚠ asks for ${r.sensitiveAsk}`);
    return parts.join(" · ");
  }
  const parts: string[] = [r.requestedAction];
  if (r.claimedVendorName) parts.push(r.claimedVendorName);
  if (r.amountCents != null) parts.push(`$${(r.amountCents / 100).toFixed(2)}`);
  if (r.invoiceNumber) parts.push(`#${r.invoiceNumber}`);
  if (r.newBankDetails) parts.push(`new bank …${(r.newBankDetails.account ?? r.newBankDetails.routing ?? "").slice(-4)}`);
  if (r.claimedSenderRole !== "unknown") parts.push(`claims: ${r.claimedSenderRole}`);
  if (r.injectionAttempt) parts.push("⚠ injection");
  if (r.sensitiveAsk) parts.push(`⚠ asks for ${r.sensitiveAsk}`);
  return parts.join(" · ");
}
