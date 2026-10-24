// The answer key through the real P3 agents (owner: P3). Spec §6.2, §6.3, §7.1, §9.
// scenarios/scenarios.test.ts (P1) runs the answer key with a small reference verifier. This file runs the
// same scenarios through the real Vendor Verifier and Risk Analyst on the seed world, then the real Policy
// Engine, wired the way pipeline.advance wires them, and expects the same decisions.
import { describe, expect, it } from "vitest";
import { DEFAULT_REQUEST, SCENARIOS, summaryLine, type Scenario } from "../../scenarios/run";
import { DEMO_POLICY } from "../config";
import { decide } from "../policy/engine";
import { buildSeedBook } from "../seedWorld";
import type { PaymentRequest, PolicyResult, RiskFindings, RiskFlag, VendorFindings } from "../types";
import { assessRisk } from "./assessRisk";
import { crsFromFraudFinder, crsUnavailable, emailToScreen, parseFraudFinder } from "./crs";
import type { CaseInfo, VerificationBook } from "./types";
import { verifyVendor } from "./verifyVendor";

const RECEIVED_AT = Date.UTC(2026, 9, 24, 18); // 11:00 PDT, so off_hours stays out of the way
const LATE_NIGHT = Date.UTC(2026, 9, 24, 6, 30); // 23:30 PDT
const DECIDED_AT = Date.UTC(2026, 9, 24, 12); // scenarios/run.ts decides at this instant too
const PAID_AT = Date.UTC(2026, 9, 1); // when scenarios/world.ts marks an invoice paid

type Message = Pick<Scenario, "channel" | "from" | "text">;
type Outcome = { findings: VendorFindings | null; risk: RiskFindings | null; result: PolicyResult };

function scenario(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`scenario ${id} is missing from scenarios.json`);
  return s;
}

function requestFor(s: Scenario): PaymentRequest {
  return { ...DEFAULT_REQUEST, ...s.request };
}

/** The seed world with the scenario's tweaks that a message alone can't express. */
function bookFor(s: Scenario): VerificationBook {
  const book = buildSeedBook();
  for (const inv of book.invoices) {
    if (s.world?.paidInvoices?.includes(inv.number)) Object.assign(inv, { status: "paid", paidAt: PAID_AT });
  }
  return book;
}

function findingsAndRisk(m: Message, request: PaymentRequest, book: VerificationBook, receivedAt = RECEIVED_AT) {
  const caseInfo: CaseInfo = { channel: m.channel, fromAddress: m.from, rawContent: m.text, receivedAt };
  return {
    findings: verifyVendor({ request, fromAddress: m.from, book }),
    risk: assessRisk({ request, caseInfo, book }),
  };
}

/** What pipeline.advance does with the two P3 agents' output, ending in decide(). */
function runThroughP3(s: Scenario, crs?: VendorFindings["crs"]): Outcome {
  const request = requestFor(s);
  const book = bookFor(s);
  // advance skips both agents when nothing was asked for.
  const ran = request.requestedAction === "none" ? null : findingsAndRisk(s, request, book);
  // CRS runs in runVendorVerifier's Convex seam. The crs argument, or a world that says what CRS
  // returned, stands in for it.
  const findings: VendorFindings | null = ran && {
    ...ran.findings,
    crs: crs ?? { status: s.world?.crs ?? ran.findings.crs.status },
    ofacHit: s.world?.ofacHit ?? ran.findings.ofacHit,
  };
  // loadContext: the vendor comes from findings.vendorId and the invoice from findings.matchingInvoiceId.
  const vendor = book.vendors.find((v) => v.id === findings?.vendorId) ?? null;
  const invoice = book.invoices.find((i) => i.id === findings?.matchingInvoiceId) ?? null;
  const result = decide({
    request,
    vendor: vendor && {
      id: vendor.id,
      name: vendor.name,
      typicalAmountRange: vendor.typicalAmountRange,
      alwaysEscalate: vendor.alwaysEscalate,
    },
    vendorFindings: findings,
    riskFindings: ran?.risk ?? null,
    invoice: invoice && {
      id: invoice.id,
      number: invoice.number,
      amountCents: invoice.amountCents,
      status: invoice.status,
      paidAt: invoice.paidAt ?? null,
    },
    callbackOutcome: s.callbackOutcome ?? null,
    approval: s.approval ? { method: "otp", approved: true, coolingOffUntil: null } : null,
    policy: DEMO_POLICY,
    now: DECIDED_AT,
  });
  return { findings, risk: ran?.risk ?? null, result };
}

describe("the answer key through the real P3 agents and the Policy Engine", () => {
  const results: { s: Scenario; r: PolicyResult }[] = [];

  for (const s of SCENARIOS) {
    it(`${s.scam ? "scam" : "legit"}: ${s.id} -> ${s.expectedDecision}`, () => {
      const { result } = runThroughP3(s);
      results.push({ s, r: result });
      expect(result.decision, result.reasons.join("\n")).toBe(s.expectedDecision);
      expect(result.firedRules).toEqual(expect.arrayContaining(s.expectedRules));
      if (s.expectOverridable !== undefined) expect(result.overridable).toBe(s.expectOverridable);
      if (s.scam) expect(result.decision).not.toBe("PAY");
    });
  }

  it("gives the pitch line with real P3 findings", () => {
    expect(results).toHaveLength(SCENARIOS.length);
    expect(summaryLine(results)).toMatch(/· 0 false PAY$/);
    expect(results.filter(({ s, r }) => r.decision !== s.expectedDecision).map(({ s }) => s.id)).toEqual([]);
  });
});

describe("what P3 hands decide() for key scenarios", () => {
  it.each<[string, Partial<VendorFindings>, RiskFlag[]]>([
    [
      "pixel-bank-change-denied",
      { vendorId: "pixel", matchConfidence: 1, senderOnFile: false, bankMatches: false, matchingInvoiceId: "inv-1042" },
      ["bank_change", "new_sender", "urgency"],
    ],
    // Caller ID says Pixel & Pine, so the sender is on file, but new bank details still need the callback (R2).
    [
      "pixel-bank-change-spoofed-caller-id",
      { vendorId: "pixel", senderOnFile: true, bankMatches: false, matchingInvoiceId: "inv-1042" },
      ["bank_change"],
    ],
    // No number and no amount: Sam's only open invoice. The sender is unknown, which R3 ignores for a third party.
    ["sam-weekly", { vendorId: "sam", senderOnFile: false, bankMatches: null, matchingInvoiceId: "inv-W42" }, ["new_sender"]],
    // From the owner's registered phone, which counts as on file.
    ["northwind-happy", { vendorId: "northwind", senderOnFile: true, matchingInvoiceId: "inv-NW-889" }, []],
    ["duplicate-invoice", { vendorId: "northwind", matchingInvoiceId: null, alreadyPaidAt: PAID_AT }, []],
  ])("%s", (id, expectedFindings, expectedFlags) => {
    const { findings, risk } = runThroughP3(scenario(id));
    expect(findings).toMatchObject({ ...expectedFindings, crs: { status: "not_checked" }, ofacHit: false });
    expect(risk?.flags).toEqual(expectedFlags);
  });

  it.each(["google-workspace-lookalike", "northwind-lookalike-invoice"])("%s flags its lookalike domain", (id) => {
    expect(runThroughP3(scenario(id)).risk?.flags).toContain("lookalike_domain");
  });
});

describe("safety properties over the answer key", () => {
  it("no scam looks fully verified to P3", () => {
    for (const s of SCENARIOS.filter((x) => x.scam)) {
      const { findings, risk } = runThroughP3(s);
      const looksClean =
        !!findings?.vendorId &&
        findings.senderOnFile &&
        findings.bankMatches !== false &&
        !!findings.matchingInvoiceId &&
        risk?.flags.length === 0;
      expect(looksClean, s.id).toBe(false);
    }
  });

  it("verifyVendor alone never reports CRS or OFAC as checked (CRS runs in the Convex seam)", () => {
    for (const s of SCENARIOS.filter((x) => x.request.requestedAction !== "none")) {
      const { findings } = findingsAndRisk(s, requestFor(s), bookFor(s));
      expect(findings.crs, s.id).toEqual({ status: "not_checked" });
      expect(findings.ofacHit, s.id).toBe(false);
    }
  });

  it("no legitimate request trips a flag that blocks or escalates on its own (R9, R11, R15)", () => {
    for (const s of SCENARIOS.filter((x) => !x.scam && x.request.requestedAction !== "none")) {
      const flags = runThroughP3(s).risk?.flags ?? [];
      expect(flags.filter((f) => ["forbidden_rail", "owner_impersonation", "injection_attempt"].includes(f)), s.id).toEqual([]);
    }
  });

  it("riskScore stays within 0..100 and the explanation is two sentences", () => {
    for (const s of SCENARIOS.filter((x) => x.request.requestedAction !== "none")) {
      const risk = runThroughP3(s).risk!;
      expect(risk.riskScore, s.id).toBeGreaterThanOrEqual(0);
      expect(risk.riskScore, s.id).toBeLessThanOrEqual(100);
      expect(risk.explanation.split(/(?<=\.)\s+/), s.id).toHaveLength(2);
    }
  });
});

describe("CRS screening on the answer key", () => {
  // The scores the CRS sandbox gave on 2026-10-24 to a stranger's and to a seed vendor's *.example address.
  const sandbox = parseFraudFinder({
    risk: { score: 100, domain: { domain_risk_score: 10 } },
    email_validation: { status: "invalid", role_account: true },
  })!;
  const screened = SCENARIOS.filter(
    (s) => s.request.requestedAction !== "none" && emailToScreen(s.from, bookFor(s)) !== null,
  );

  it("screens only strangers' emails, never the owner or a vendor's address on file", () => {
    expect(screened.map((s) => s.id).sort()).toEqual(["google-workspace-lookalike", "northwind-lookalike-invoice", "ofac-hit"]);
  });

  it.each<[string, VendorFindings["crs"]]>([
    ["AtData scores the sender 100, as the sandbox does any *.example address", crsFromFraudFinder(sandbox)],
    ["AtData scores the sender low", crsFromFraudFinder({ ...sandbox, score: 5 })],
    ["CRS is down", crsUnavailable("timeout")],
  ])("no decision changes when %s", (_label, crs) => {
    for (const s of screened) {
      const { result } = runThroughP3(s, crs);
      expect(result.decision, s.id).toBe(s.expectedDecision);
      if (s.expectOverridable !== undefined) expect(result.overridable, s.id).toBe(s.expectOverridable);
    }
  });
});

describe("text backstops when the parser extracts nothing", () => {
  const EMPTY: PaymentRequest = { ...DEFAULT_REQUEST, requestedAction: "other" };

  it.each<[string, RiskFlag]>([
    ["pixel-bank-change-denied", "bank_change"],
    ["owner-impersonation", "owner_impersonation"],
    ["gift-cards", "forbidden_rail"],
    ["injection", "injection_attempt"],
    ["aws-lookalike", "urgency"],
  ])("%s still raises %s", (id, flag) => {
    const s = scenario(id);
    const { findings, risk } = findingsAndRisk(s, EMPTY, bookFor(s));
    expect(risk.flags).toContain(flag);
    // No parsed vendor name and no sender on a vendor's file: no vendor, so decide() sees R1.
    expect(findings.vendorId).toBeNull();
  });
});

describe("variants on the seed world", () => {
  const northwind = scenario("northwind-happy");
  const pixelScam = scenario("pixel-bank-change-denied");

  it("a payment still in flight for NW-889 stops a second one", () => {
    const book = buildSeedBook();
    const sentAt = Date.UTC(2026, 9, 24, 17, 30);
    book.payments.push({ invoiceId: "inv-NW-889", vendorId: "northwind", status: "pending", createdAt: sentAt });
    const { findings } = findingsAndRisk(northwind, requestFor(northwind), book);
    expect(findings.matchingInvoiceId).toBeNull();
    expect(findings.alreadyPaidAt).toBe(sentAt);
  });

  it("the Pixel & Pine scam at 23:30 Pacific also flags off_hours", () => {
    const { risk } = findingsAndRisk(pixelScam, requestFor(pixelScam), buildSeedBook(), LATE_NIGHT);
    expect(risk.flags).toEqual(["bank_change", "new_sender", "urgency", "off_hours"]);
  });

  it("an email from a lookalike of the vendor's domain is not on file and flags lookalike_domain", () => {
    const email: Message = {
      channel: "email",
      from: "Pixel & Pine Billing <billing@pixelandpine.co>",
      text: "Hi Priya, invoice #1042 for $4,800 attached. Please pay our new account: routing 021000021 account 55519921.",
    };
    const request: PaymentRequest = {
      ...DEFAULT_REQUEST,
      claimedVendorName: "Pixel & Pine",
      claimedSenderRole: "vendor",
      amountCents: 4_800_00,
      invoiceNumber: "#1042",
      newBankDetails: { routing: "021000021", account: "55519921" },
    };
    const { findings, risk } = findingsAndRisk(email, request, buildSeedBook());
    expect(findings).toMatchObject({ vendorId: "pixel", senderOnFile: false, bankMatches: false });
    expect(risk.flags).toEqual(["bank_change", "lookalike_domain", "new_sender"]);
  });

  it("a sender on the known-bad list is never on file, even the vendor's own number", () => {
    const book = buildSeedBook();
    const pixel = book.vendors.find((v) => v.id === "pixel")!;
    pixel.knownBadSenders = [pixel.phoneOnFile];
    const sms: Message = { channel: "sms", from: pixel.phoneOnFile, text: "Please pay invoice 1042." };
    const request: PaymentRequest = { ...DEFAULT_REQUEST, claimedVendorName: "Pixel & Pine", invoiceNumber: "1042" };
    const { findings, risk } = findingsAndRisk(sms, request, book);
    expect(findings.vendorId).toBe("pixel");
    expect(findings.senderOnFile).toBe(false);
    expect(risk.flags).toContain("new_sender");
  });

  it("an empty vendor book (seed not loaded) matches nothing", () => {
    const empty: VerificationBook = { vendors: [], invoices: [], payments: [], owner: null };
    const { findings, risk } = findingsAndRisk(northwind, requestFor(northwind), empty);
    expect(findings).toEqual({
      vendorId: null,
      matchConfidence: 0,
      senderOnFile: false,
      bankMatches: null,
      crs: { status: "not_checked" },
      ofacHit: false,
      matchingInvoiceId: null,
      alreadyPaidAt: null,
    });
    expect(risk.flags).toEqual(["new_sender"]);
  });
});
