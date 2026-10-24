// End-to-end check of the P3 pure logic on the seed world (owner: P3). Spec §6.2, §6.3, §7.1, §9.
// scenarios.json (P1) is the answer key for decisions. This file pins what P3 hands decide() for each
// scenario, given the request the Intake Parser should extract (P1 owns the real parser).
import { describe, expect, it } from "vitest";
import scenarioFile from "../../scenarios/scenarios.json";
import { buildSeedBook } from "../seedWorld";
import type { PaymentRequest, RiskFlag, VendorFindings } from "../types";
import { assessRisk } from "./assessRisk";
import type { CaseInfo, VerificationBook } from "./types";
import { verifyVendor } from "./verifyVendor";

type Scenario = (typeof scenarioFile.scenarios)[number];

const DAYTIME = Date.UTC(2026, 9, 24, 18); // 11:00 PDT on Saturday, so off_hours stays out of the way
const LATE_NIGHT = Date.UTC(2026, 9, 24, 6, 30); // 23:30 PDT on Friday

/** What today's stubbed Intake Parser returns for every message (convex/agents/intake.ts). */
const STUB_REQUEST: PaymentRequest = {
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

function parsed(overrides: Partial<PaymentRequest>): PaymentRequest {
  return { ...STUB_REQUEST, ...overrides };
}

/** What the Intake Parser should extract from each scenario's text. */
const PARSED: Record<string, PaymentRequest> = {
  "pixel-bank-change": parsed({
    claimedVendorName: "Pixel & Pine",
    claimedSenderRole: "vendor",
    invoiceNumber: "#1042",
    newBankDetails: { routing: "021000021", account: "55519921" },
    urgencyClaims: ["today"],
    requestedAction: "change_bank",
  }),
  "owner-impersonation": parsed({ claimedSenderRole: "owner", urgencyClaims: ["now"] }),
  "aws-lookalike": parsed({
    claimedVendorName: "AWS",
    claimedSenderRole: "vendor",
    amountCents: 2_999_00,
    urgencyClaims: ["Urgent", "or your servers shut down"],
    requestedAction: "pay_invoice",
  }),
  "gift-cards": parsed({ amountCents: 1_000_00, requestedAction: "gift_cards" }),
  injection: parsed({ amountCents: 500_00, requestedAction: "pay_invoice", injectionAttempt: true }),
  "sam-weekly": parsed({ claimedVendorName: "Sam Ortiz", requestedAction: "pay_invoice" }),
  "northwind-happy": parsed({ claimedVendorName: "Northwind", invoiceNumber: "#NW-889", requestedAction: "pay_invoice" }),
};

type Expected = { findings: Omit<VendorFindings, "crs" | "ofacHit">; flags: RiskFlag[] };

const NO_VENDOR: Expected["findings"] = {
  vendorId: null,
  matchConfidence: 0,
  senderOnFile: false,
  bankMatches: null,
  matchingInvoiceId: null,
  alreadyPaidAt: null,
};

const EXPECTED: Record<string, Expected> = {
  "pixel-bank-change": {
    findings: {
      vendorId: "pixel",
      matchConfidence: 1,
      senderOnFile: false,
      bankMatches: false,
      matchingInvoiceId: "inv-1042",
      alreadyPaidAt: null,
    },
    flags: ["bank_change", "new_sender", "urgency"],
  },
  "owner-impersonation": { findings: NO_VENDOR, flags: ["owner_impersonation", "new_sender", "urgency"] },
  "aws-lookalike": { findings: NO_VENDOR, flags: ["new_sender", "urgency"] },
  "gift-cards": { findings: NO_VENDOR, flags: ["forbidden_rail", "new_sender"] },
  injection: { findings: NO_VENDOR, flags: ["injection_attempt", "new_sender"] },
  // Sent from the owner's registered phone, which counts as on file (decided with the user).
  "sam-weekly": {
    findings: {
      vendorId: "sam",
      matchConfidence: 1,
      senderOnFile: true,
      bankMatches: null,
      matchingInvoiceId: "inv-W42",
      alreadyPaidAt: null,
    },
    flags: [],
  },
  "northwind-happy": {
    findings: {
      vendorId: "northwind",
      matchConfidence: 1,
      senderOnFile: true,
      bankMatches: null,
      matchingInvoiceId: "inv-NW-889",
      alreadyPaidAt: null,
    },
    flags: [],
  },
};

/** requestedAction "none": the pipeline never runs the P3 agents for these. */
const NOT_P3 = new Set(["hello"]);

function scenario(id: string): Scenario {
  const s = scenarioFile.scenarios.find((x) => x.id === id);
  if (!s) throw new Error(`scenario ${id} is missing from scenarios.json`);
  return s;
}

function run(
  s: Pick<Scenario, "channel" | "from" | "text">,
  request: PaymentRequest,
  book: VerificationBook = buildSeedBook(),
  receivedAt = DAYTIME,
) {
  const caseInfo: CaseInfo = {
    channel: s.channel as CaseInfo["channel"],
    fromAddress: s.from,
    rawContent: s.text,
    receivedAt,
  };
  return {
    vendor: verifyVendor({ request, fromAddress: s.from, book }),
    risk: assessRisk({ request, caseInfo, book }),
  };
}

describe("P3 findings per scenario (seed world, parsed request)", () => {
  for (const [id, expected] of Object.entries(EXPECTED)) {
    it(id, () => {
      const { vendor, risk } = run(scenario(id), PARSED[id]);
      expect(vendor).toEqual({ ...expected.findings, crs: { status: "not_checked" }, ofacHit: false });
      expect(risk.flags).toEqual(expected.flags);
    });
  }

  for (const s of scenarioFile.scenarios) {
    if (!EXPECTED[s.id] && !NOT_P3.has(s.id)) it.todo(`${s.id}: add its parsed request and expected P3 findings`);
  }
});

describe("safety properties over the scenarios", () => {
  const covered = scenarioFile.scenarios.filter((s) => EXPECTED[s.id]);

  it("no scam looks fully verified to P3", () => {
    for (const s of covered.filter((x) => x.scam)) {
      const { vendor, risk } = run(s, PARSED[s.id]);
      const looksClean =
        vendor.vendorId !== null &&
        vendor.senderOnFile &&
        vendor.bankMatches !== false &&
        vendor.matchingInvoiceId !== null &&
        risk.flags.length === 0;
      expect(looksClean, s.id).toBe(false);
    }
  });

  it("every PAY scenario has a vendor, a sender on file, an open invoice and no red flags", () => {
    for (const s of covered.filter((x) => x.expectedDecision === "PAY")) {
      const { vendor, risk } = run(s, PARSED[s.id]);
      expect(vendor.vendorId, s.id).not.toBeNull();
      expect(vendor.senderOnFile, s.id).toBe(true);
      expect(vendor.bankMatches, s.id).not.toBe(false);
      expect(vendor.matchingInvoiceId, s.id).not.toBeNull();
      expect(vendor.alreadyPaidAt, s.id).toBeNull();
      expect(risk.flags, s.id).toEqual([]);
    }
  });

  it("CRS is never reported as checked before it is wired", () => {
    for (const s of covered) {
      const { vendor } = run(s, PARSED[s.id]);
      expect(vendor.crs, s.id).toEqual({ status: "not_checked" });
      expect(vendor.ofacHit, s.id).toBe(false);
    }
  });

  it("riskScore stays within 0..100 and the explanation is two sentences", () => {
    for (const s of covered) {
      const { risk } = run(s, PARSED[s.id]);
      expect(risk.riskScore, s.id).toBeGreaterThanOrEqual(0);
      expect(risk.riskScore, s.id).toBeLessThanOrEqual(100);
      expect(risk.explanation.split(/(?<=\.)\s+/), s.id).toHaveLength(2);
    }
  });
});

describe("with today's stub intake, text backstops still raise the flags", () => {
  it.each<[string, RiskFlag[]]>([
    ["pixel-bank-change", ["bank_change", "new_sender", "urgency"]],
    ["owner-impersonation", ["owner_impersonation", "new_sender", "urgency"]],
    ["aws-lookalike", ["new_sender", "urgency"]],
    ["gift-cards", ["forbidden_rail", "new_sender"]],
    ["injection", ["injection_attempt", "new_sender"]],
    ["sam-weekly", []],
    ["northwind-happy", []],
  ])("%s", (id, flags) => {
    const { vendor, risk } = run(scenario(id), STUB_REQUEST);
    expect(risk.flags).toEqual(flags);
    // No parsed vendor name and no sender on a vendor's file: no vendor, so decide() sees R1.
    expect(vendor.vendorId).toBeNull();
    expect(vendor.senderOnFile).toBe(false);
  });
});

describe("variants on the seed world", () => {
  const northwind = scenario("northwind-happy");
  const pixelScam = scenario("pixel-bank-change");

  it("a second request for NW-889 after it was paid reports alreadyPaidAt and no open invoice", () => {
    const book = buildSeedBook();
    const inv = book.invoices.find((i) => i.id === "inv-NW-889")!;
    inv.status = "paid";
    inv.paidAt = Date.UTC(2026, 9, 24, 17);
    const { vendor } = run(northwind, PARSED["northwind-happy"], book);
    expect(vendor.matchingInvoiceId).toBeNull();
    expect(vendor.alreadyPaidAt).toBe(inv.paidAt);
  });

  it("a payment still in flight for NW-889 also stops a second one", () => {
    const book = buildSeedBook();
    const sentAt = Date.UTC(2026, 9, 24, 17, 30);
    book.payments.push({ invoiceId: "inv-NW-889", vendorId: "northwind", status: "pending", createdAt: sentAt });
    const { vendor } = run(northwind, PARSED["northwind-happy"], book);
    expect(vendor.matchingInvoiceId).toBeNull();
    expect(vendor.alreadyPaidAt).toBe(sentAt);
  });

  it("the Pixel & Pine scam at 23:30 Pacific also flags off_hours", () => {
    const { risk } = run(pixelScam, PARSED["pixel-bank-change"], buildSeedBook(), LATE_NIGHT);
    expect(risk.flags).toEqual(["bank_change", "new_sender", "urgency", "off_hours"]);
  });

  it("an email from a lookalike of the vendor's domain is not on file and flags lookalike_domain", () => {
    const email = {
      channel: "email",
      from: "Pixel & Pine Billing <billing@pixelandpine.co>",
      text: "Hi Priya, invoice #1042 for $4,800 attached. Please pay our new account: routing 021000021 account 55519921.",
    };
    const request = parsed({
      claimedVendorName: "Pixel & Pine",
      claimedSenderRole: "vendor",
      amountCents: 4_800_00,
      invoiceNumber: "#1042",
      newBankDetails: { routing: "021000021", account: "55519921" },
      requestedAction: "change_bank",
    });
    const { vendor, risk } = run(email, request);
    expect(vendor.vendorId).toBe("pixel");
    expect(vendor.senderOnFile).toBe(false);
    expect(vendor.bankMatches).toBe(false);
    expect(risk.flags).toEqual(["bank_change", "lookalike_domain", "new_sender"]);
  });

  it("the real vendor emailing from its address on file is on file and raises no flags", () => {
    const email = {
      channel: "email",
      from: "billing@pixelandpine.example",
      text: "Invoice #1042 for $4,800 is due tomorrow. Thanks!",
    };
    const request = parsed({
      claimedVendorName: "Pixel & Pine Design",
      claimedSenderRole: "vendor",
      amountCents: 4_800_00,
      invoiceNumber: "1042",
      requestedAction: "pay_invoice",
    });
    const { vendor, risk } = run(email, request);
    expect(vendor).toMatchObject({ vendorId: "pixel", senderOnFile: true, bankMatches: null, matchingInvoiceId: "inv-1042" });
    expect(risk.flags).toEqual([]);
  });

  it("a sender on the known-bad list is never on file, even the vendor's own number", () => {
    const book = buildSeedBook();
    const pixel = book.vendors.find((v) => v.id === "pixel")!;
    pixel.knownBadSenders = [pixel.phoneOnFile];
    const sms = { channel: "sms", from: pixel.phoneOnFile, text: "Please pay invoice 1042." };
    const request = parsed({ claimedVendorName: "Pixel & Pine", invoiceNumber: "1042", requestedAction: "pay_invoice" });
    const { vendor, risk } = run(sms, request, book);
    expect(vendor.vendorId).toBe("pixel");
    expect(vendor.senderOnFile).toBe(false);
    expect(risk.flags).toContain("new_sender");
  });

  it("an empty vendor book (seed not loaded) matches nothing", () => {
    const empty: VerificationBook = { vendors: [], invoices: [], payments: [], owner: null };
    const { vendor, risk } = run(northwind, PARSED["northwind-happy"], empty);
    expect(vendor).toEqual({ ...NO_VENDOR, crs: { status: "not_checked" }, ofacHit: false });
    expect(risk.flags).toEqual(["new_sender"]);
  });
});
