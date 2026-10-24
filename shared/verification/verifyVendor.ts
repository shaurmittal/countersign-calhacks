// Vendor Verifier core (owner: P3). Spec §6.2.
// Pure: matches the claimed vendor, checks the sender and bank details against its record, and finds
// the invoice. CRS (KYB + OFAC) isn't wired yet, so crs is "not_checked" and ofacHit: false only
// means OFAC did not run; decide() must not read either as a pass.
import type { PaymentRequest, VendorFindings } from "../types";
import { compareBank } from "./bank";
import { matchInvoice } from "./invoices";
import type { SearchHit, VerificationBook } from "./types";
import { checkSender, matchVendor } from "./vendorMatch";

export function verifyVendor(args: {
  request: PaymentRequest;
  fromAddress: string;
  book: VerificationBook;
  /** Moss hits for the claimed name, once the index exists. Pass the same hits to assessRisk. */
  searchHits?: readonly SearchHit[];
}): VendorFindings {
  const { request, fromAddress, book } = args;
  const match = matchVendor(request.claimedVendorName, fromAddress, book.vendors, args.searchHits);
  const vendor = book.vendors.find((v) => v.id === match.vendorId) ?? null;
  const sender = checkSender(fromAddress, vendor, book);
  const invoice = matchInvoice({
    vendorId: vendor?.id ?? null,
    invoiceNumber: request.invoiceNumber,
    amountCents: request.amountCents,
    invoices: book.invoices,
    payments: book.payments,
  });
  return {
    vendorId: vendor?.id ?? null,
    matchConfidence: vendor ? match.confidence : 0,
    // The owner's registered phone or email counts as on file: calling the vendor back can't confirm
    // a request the owner sent. A sender on any known-bad list never counts.
    senderOnFile: vendor !== null && !sender.knownBad && (sender.onMatchedVendorFile || sender.isOwner),
    bankMatches: compareBank(request.newBankDetails, vendor),
    crs: { status: "not_checked" },
    ofacHit: false,
    matchingInvoiceId: invoice.matchingInvoiceId,
    alreadyPaidAt: invoice.alreadyPaidAt,
  };
}
