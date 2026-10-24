// Vendor Verifier core (owner: P3). Spec §6.2.
// Pure: matches the claimed vendor, checks the sender and bank details against its record, and finds
// the invoice. CRS runs in the Convex seam (runVendorVerifier, with shared/verification/crs.ts), so crs
// is "not_checked" here. ofacHit: false only means OFAC did not run (the team's CRS account has no OFAC
// product); decide() must not read it as a pass.
// The owner's lists (shared/verification/lists.ts): deny hits go to decide(), which blocks on R16; a trust
// entry only makes senderOnFile true, so it satisfies R3 and nothing else.
import type { PaymentRequest, VendorFindings } from "../types";
import { compareBank } from "./bank";
import { matchInvoice } from "./invoices";
import { denyListHits } from "./lists";
import type { SearchHit, VerificationBook } from "./types";
import { checkSender, matchVendor } from "./vendorMatch";

export function verifyVendor(args: {
  request: PaymentRequest;
  fromAddress: string;
  book: VerificationBook;
  /** Moss hits for the claimed name, once the index exists. Pass the same hits to assessRisk. */
  searchHits?: readonly SearchHit[];
  /** The message itself, so a deny-listed domain written in it (a payment link, say) is caught. */
  rawContent?: string;
}): VendorFindings {
  const { request, fromAddress, book } = args;
  const lists = book.lists ?? [];
  const match = matchVendor(request.claimedVendorName, fromAddress, book.vendors, args.searchHits, lists);
  const vendor = book.vendors.find((v) => v.id === match.vendorId) ?? null;
  const sender = checkSender(fromAddress, vendor, book);
  const denyHits = denyListHits({ fromAddress, rawContent: args.rawContent, request, lists });
  const invoice = matchInvoice({
    vendorId: vendor?.id ?? null,
    invoiceNumber: request.invoiceNumber,
    amountCents: request.amountCents,
    invoices: book.invoices,
    payments: book.payments,
  });
  // The owner's registered phone or email counts as on file: calling the vendor back can't confirm
  // a request the owner sent. A sender on any known-bad list, or hitting the deny list, never counts.
  const onRecord = sender.onMatchedVendorFile || sender.isOwner;
  const eligible = vendor !== null && !sender.knownBad && denyHits.length === 0;
  const trustedOnly = eligible && !onRecord && sender.trustedByOwner === true;
  return {
    vendorId: vendor?.id ?? null,
    matchConfidence: vendor ? match.confidence : 0,
    senderOnFile: eligible && (onRecord || trustedOnly),
    bankMatches: compareBank(request.newBankDetails, vendor),
    crs: { status: "not_checked" },
    ofacHit: false,
    matchingInvoiceId: invoice.matchingInvoiceId,
    alreadyPaidAt: invoice.alreadyPaidAt,
    // Only present when they say something, so findings from a book with no lists are unchanged.
    ...(denyHits.length > 0 ? { denyListHits: denyHits } : {}),
    ...(trustedOnly ? { trustedByOwner: true } : {}),
  };
}
