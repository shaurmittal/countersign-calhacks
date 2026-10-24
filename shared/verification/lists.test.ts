import { describe, expect, it } from "vitest";
import { DEMO_POLICY } from "../config";
import { decide } from "../policy/engine";
import { buildSeedBook } from "../seedWorld";
import type { CallbackOutcome, ListMatch, PaymentRequest, PolicyInput } from "../types";
import { assessRisk } from "./assessRisk";
import { bankKey, denyListHits, isOwnerDeniedSender, isTrustedSender, normalizeDomain, normalizeListValue } from "./lists";
import type { BookListEntry, VerificationBook } from "./types";
import { verifyVendor } from "./verifyVendor";

const NOW = Date.UTC(2026, 9, 24, 18); // 11:00 in San Francisco: not off-hours
const REQUEST: PaymentRequest = {
  claimedVendorName: null,
  claimedSenderRole: "unknown",
  amountCents: null,
  currency: "USD",
  invoiceNumber: null,
  newBankDetails: null,
  urgencyClaims: [],
  requestedAction: "pay_invoice",
  injectionAttempt: false,
};
const SAM_NEW_PHONE = "+15555550188";
const NEW_BANK = { routing: "021000021", account: "55519921" };

const deny = (match: ListMatch, value: string, id = `deny-${match}`): BookListEntry => ({ id, kind: "deny", match, value });
const trust = (match: ListMatch, value: string, vendorId: string, id = `trust-${match}`): BookListEntry => ({
  id,
  kind: "trust",
  match,
  value,
  vendorId,
});
const bookWith = (...lists: BookListEntry[]): VerificationBook => ({ ...buildSeedBook(NOW), lists });

/** The pipeline's order on the seed world: Vendor Verifier and Risk Analyst, then the Policy Engine. */
function run(
  book: VerificationBook,
  fromAddress: string,
  request: Partial<PaymentRequest>,
  opts: { rawContent?: string; callbackOutcome?: CallbackOutcome | null; approved?: boolean } = {},
) {
  const req = { ...REQUEST, ...request };
  const rawContent = opts.rawContent ?? "";
  const findings = verifyVendor({ request: req, fromAddress, book, rawContent });
  const risk = assessRisk({ request: req, caseInfo: { channel: "web", fromAddress, rawContent, receivedAt: NOW }, book });
  const vendor = book.vendors.find((v) => v.id === findings.vendorId) ?? null;
  const invoice = book.invoices.find((i) => i.id === findings.matchingInvoiceId) ?? null;
  const input: PolicyInput = {
    request: req,
    vendor: vendor && { id: vendor.id, name: vendor.name, typicalAmountRange: vendor.typicalAmountRange, alwaysEscalate: vendor.alwaysEscalate },
    vendorFindings: findings,
    riskFindings: risk,
    invoice: invoice && { id: invoice.id, number: invoice.number, amountCents: invoice.amountCents, status: invoice.status, paidAt: null },
    callbackOutcome: opts.callbackOutcome ?? null,
    approval: opts.approved ? { method: "otp", approved: true, coolingOffUntil: null } : null,
    policy: DEMO_POLICY,
    now: NOW,
  };
  return { findings, risk, result: decide(input) };
}

describe("normalizeListValue", () => {
  it("phones become digits, with a 10-digit US number's leading 1", () => {
    expect(normalizeListValue("phone", "+1 (555) 555-0199")).toBe("15555550199");
    expect(normalizeListValue("phone", "555 555 0199")).toBe("15555550199");
    expect(normalizeListValue("phone", "12345")).toBeNull();
  });

  it("emails are lowercased and taken from inside <...>", () => {
    expect(normalizeListValue("email", "Pixel <Billing@PixelAndPine.example>")).toBe("billing@pixelandpine.example");
    expect(normalizeListValue("email", "not an email")).toBeNull();
  });

  it("domains lose the scheme, www., path, port and trailing dot; an email gives its domain", () => {
    expect(normalizeListValue("domain", "https://www.Evil-Billing.example:8443/pay?x=1")).toBe("evil-billing.example");
    expect(normalizeListValue("domain", "billing@evil.example")).toBe("evil.example");
    expect(normalizeDomain("evil.example.")).toBe("evil.example");
    expect(normalizeListValue("domain", "localhost")).toBeNull();
    expect(normalizeListValue("domain", "")).toBeNull();
  });

  it("bank accounts become <routing>:<last 4>, from the full account or its last 4", () => {
    expect(normalizeListValue("bank", "021000021 55519921")).toBe("021000021:9921");
    expect(normalizeListValue("bank", "021000021:9921")).toBe("021000021:9921");
    expect(normalizeListValue("bank", "21000021 9921")).toBeNull(); // routing numbers have 9 digits
    expect(normalizeListValue("bank", "021000021")).toBeNull();
    expect(bankKey("021000021", "5551-9921")).toBe("021000021:9921");
  });
});

describe("denyListHits", () => {
  const request = REQUEST;

  it("matches the sender's phone, email and email domain, including subdomains", () => {
    const lists = [deny("phone", "15555559001", "p"), deny("email", "scam@mail.example", "e"), deny("domain", "evil.example", "d")];
    expect(denyListHits({ fromAddress: "+1 555-555-9001", request, lists })).toEqual([{ entryId: "p", match: "phone", source: "sender" }]);
    expect(denyListHits({ fromAddress: "Scam <SCAM@mail.example>", request, lists })).toEqual([{ entryId: "e", match: "email", source: "sender" }]);
    expect(denyListHits({ fromAddress: "ap@billing.evil.example", request, lists })).toEqual([{ entryId: "d", match: "domain", source: "sender" }]);
  });

  it("matches a deny-listed domain written in the message", () => {
    const hits = denyListHits({
      fromAddress: "web:abc12345",
      rawContent: "Please pay through https://pay.evil.example/1042 today",
      request,
      lists: [deny("domain", "evil.example")],
    });
    expect(hits).toEqual([{ entryId: "deny-domain", match: "domain", source: "message" }]);
  });

  it("matches the requested bank account by routing and last 4, or by last 4 when no routing is given", () => {
    const lists = [deny("bank", "021000021:9921")];
    expect(denyListHits({ fromAddress: "x", request: { ...request, newBankDetails: NEW_BANK }, lists })).toEqual([
      { entryId: "deny-bank", match: "bank", source: "bank" },
    ]);
    expect(denyListHits({ fromAddress: "x", request: { ...request, newBankDetails: { account: "9921" } }, lists })).toHaveLength(1);
    expect(denyListHits({ fromAddress: "x", request: { ...request, newBankDetails: { routing: "121000248", account: "55519921" } }, lists })).toEqual([]);
  });

  it("gives one hit per entry, and trust entries never hit", () => {
    const lists = [deny("domain", "evil.example"), trust("domain", "evil.example", "pixel")];
    const hits = denyListHits({ fromAddress: "ap@evil.example", rawContent: "see evil.example", request, lists });
    expect(hits).toEqual([{ entryId: "deny-domain", match: "domain", source: "sender" }]);
    expect(denyListHits({ fromAddress: "ap@evil.example", request, lists: [] })).toEqual([]);
  });

  it("isOwnerDeniedSender only looks at the sender; isTrustedSender only for the entry's vendor", () => {
    expect(isOwnerDeniedSender("ap@evil.example", [deny("domain", "evil.example")])).toBe(true);
    expect(isOwnerDeniedSender("web:abc12345", [deny("domain", "evil.example")])).toBe(false);
    const lists = [trust("phone", "15555550188", "sam")];
    expect(isTrustedSender(SAM_NEW_PHONE, "sam", lists)).toBe(true);
    expect(isTrustedSender(SAM_NEW_PHONE, "pixel", lists)).toBe(false);
    expect(isTrustedSender(SAM_NEW_PHONE, null, lists)).toBe(false);
  });
});

describe("the owner's lists through the Vendor Verifier, Risk Analyst and Policy Engine", () => {
  it("with no lists, findings carry neither new field", () => {
    const { findings } = run(bookWith(), "+15555550102", { claimedVendorName: "Northwind Cloud", invoiceNumber: "NW-889" });
    expect("denyListHits" in findings).toBe(false);
    expect("trustedByOwner" in findings).toBe(false);
  });

  it("a trusted new number satisfies R3 and the bill is paid, with R3 shown as a note", () => {
    const request = { claimedVendorName: "Sam Ortiz", claimedSenderRole: "vendor" as const, invoiceNumber: "W42" };
    // Without trust, a payee writing from a number not on file gets a callback first.
    expect(run(bookWith(), SAM_NEW_PHONE, request).result).toMatchObject({ decision: "HOLD", needs: { callback: true } });

    const { findings, risk, result } = run(bookWith(trust("phone", "15555550188", "sam")), SAM_NEW_PHONE, request);
    expect(findings).toMatchObject({ vendorId: "sam", senderOnFile: true, trustedByOwner: true });
    expect(risk.flags).not.toContain("new_sender");
    expect(result.decision).toBe("PAY");
    expect(result.firedRules).toEqual(["R3", "R12"]);
  });

  it("a trusted sender with no vendor name is matched to that vendor by sender", () => {
    const { findings } = run(bookWith(trust("phone", "15555550188", "sam")), SAM_NEW_PHONE, { invoiceNumber: "W42" });
    expect(findings.vendorId).toBe("sam");
  });

  it("trust never skips the bank-change callback, and a confirmed change still needs the owner", () => {
    const book = bookWith(trust("phone", "15555550188", "sam"));
    const request = { claimedVendorName: "Sam Ortiz", claimedSenderRole: "vendor" as const, invoiceNumber: "W42", newBankDetails: NEW_BANK };
    expect(run(book, SAM_NEW_PHONE, request).result).toMatchObject({ decision: "HOLD", needs: { callback: true } });
    expect(run(book, SAM_NEW_PHONE, request, { callbackOutcome: "confirmed" }).result).toMatchObject({
      decision: "ESCALATE",
      needs: { ownerOtp: true },
    });
  });

  it("deny beats trust for the same sender", () => {
    const book = bookWith(trust("phone", "15555550188", "sam"), deny("phone", "15555550188"));
    const { findings, risk, result } = run(book, SAM_NEW_PHONE, { claimedVendorName: "Sam Ortiz", invoiceNumber: "W42" });
    expect(findings.senderOnFile).toBe(false);
    expect("trustedByOwner" in findings).toBe(false);
    expect(findings.denyListHits).toEqual([{ entryId: "deny-phone", match: "phone", source: "sender" }]);
    expect(risk.flags).toContain("new_sender");
    expect(result).toMatchObject({ decision: "BLOCK" });
    expect(result.firedRules).toContain("R16");
  });

  it("a deny-listed sender identifies no vendor on its own", () => {
    const { findings, result } = run(bookWith(deny("phone", "15555550102")), "+15555550102", { invoiceNumber: "NW-889" });
    expect(findings.vendorId).toBeNull();
    expect(result.firedRules).toEqual(expect.arrayContaining(["R1", "R16"]));
  });

  it("a deny-listed bank account blocks, and the reason names the place, never the number", () => {
    const { result } = run(bookWith(deny("bank", "021000021:9921")), "billing@pixelandpine.example", {
      claimedVendorName: "Pixel & Pine",
      invoiceNumber: "1042",
      newBankDetails: NEW_BANK,
    });
    expect(result.decision).toBe("BLOCK");
    const r16 = result.reasons.find((r) => r.startsWith("R16"));
    expect(r16).toBe("R16 Owner deny list: On the owner's deny list: the bank account");
  });

  it("a deny-listed domain in the message blocks an otherwise happy request", () => {
    const happy = { claimedVendorName: "Northwind Cloud", invoiceNumber: "NW-889" };
    expect(run(bookWith(), "+15555550102", happy).result.decision).toBe("PAY");
    const { result } = run(bookWith(deny("domain", "northwind-pay.example")), "+15555550102", happy, {
      rawContent: "Pay Northwind #NW-889 at https://northwind-pay.example/checkout",
    });
    expect(result).toMatchObject({ decision: "BLOCK", firedRules: ["R16"] });
  });

  it("an owner approval can't lift a deny-list block", () => {
    const { result } = run(bookWith(deny("phone", "15555559001")), "+15555559001", {
      claimedVendorName: "Harbor Legal",
      amountCents: 12_000_00,
    }, { approved: true });
    expect(result.decision).toBe("BLOCK");
    expect(result.firedRules).toContain("R16");
  });
});
