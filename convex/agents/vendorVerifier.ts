// Vendor Verifier (owner: P3). Spec §6.2.
// Fuzzy-match the claimed vendor (Moss / embeddings + exact domain/phone), compare sender and
// bank details with the record, find a matching open invoice, call CRS (KYB + OFAC).
// If CRS errors or times out, return crs.status = "unavailable" (forces ESCALATE). Never guess.
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { PaymentRequest, VendorFindings } from "../../shared/types";

export async function runVendorVerifier(
  ctx: ActionCtx,
  c: Doc<"cases">,
  request: PaymentRequest,
): Promise<VendorFindings> {
  // TODO(P3)
  void ctx;
  void c;
  void request;
  return {
    vendorId: null,
    matchConfidence: 0,
    senderOnFile: false,
    bankMatches: null,
    crs: { status: "not_checked" },
    ofacHit: false,
    matchingInvoiceId: null,
    alreadyPaidAt: null,
  };
}
