// Risk Analyst core (owner: P3). Spec §6.3.
// Pure: rule-based red flags, a display-only score and a two-sentence explanation. It never decides.
// It runs in parallel with the Vendor Verifier, so it repeats the same deterministic vendor match.
import { DEMO_POLICY } from "../config";
import type { PaymentRequest, RiskFindings } from "../types";
import { compareBank } from "./bank";
import { explainRisk } from "./explain";
import { findLookalikeDomains } from "./lookalike";
import { computeFlags, riskScore } from "./riskFlags";
import type { CaseInfo, SearchHit, VerificationBook } from "./types";
import { checkSender, matchVendor } from "./vendorMatch";

export function assessRisk(args: {
  request: PaymentRequest;
  caseInfo: CaseInfo;
  book: VerificationBook;
  /** The same Moss hits verifyVendor got, so both agents agree on the vendor. */
  searchHits?: readonly SearchHit[];
}): RiskFindings {
  const { request, caseInfo, book } = args;
  const match = matchVendor(request.claimedVendorName, caseInfo.fromAddress, book.vendors, args.searchHits);
  const vendor = book.vendors.find((v) => v.id === match.vendorId) ?? null;
  const lookalikeDomains = findLookalikeDomains({
    fromAddress: caseInfo.fromAddress,
    rawContent: caseInfo.rawContent,
    vendors: book.vendors,
    ownerEmail: book.owner?.email ?? null,
  });
  const flags = computeFlags({
    request,
    rawContent: caseInfo.rawContent,
    receivedAt: caseInfo.receivedAt,
    vendor,
    bankMatches: compareBank(request.newBankDetails, vendor),
    sender: checkSender(caseInfo.fromAddress, vendor, book),
    lookalikeDomains,
    ownerName: book.owner?.name ?? null,
    policy: book.owner?.policy ?? DEMO_POLICY,
  });
  return { riskScore: riskScore(flags), flags, explanation: explainRisk({ flags, lookalikeDomains }) };
}
