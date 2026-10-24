import { describe, expect, it } from "vitest";
import { DEMO_POLICY } from "../config";
import type {
  ApprovalState,
  InvoiceRecord,
  PaymentRequest,
  PolicyInput,
  RiskFindings,
  VendorFindings,
  VendorRecord,
} from "../types";
import { decide } from "./engine";

// A known vendor with an open invoice: the happy path. Each test changes one thing.
const NORTHWIND: VendorRecord = { id: "v_northwind", name: "Northwind Cloud", typicalAmountRange: [310_00, 420_00] };
const INVOICE: InvoiceRecord = { id: "i_nw889", number: "NW-889", amountCents: 362_00, status: "open", paidAt: null };

const REQUEST: PaymentRequest = {
  claimedVendorName: "Northwind Cloud",
  claimedSenderRole: "unknown",
  amountCents: null,
  currency: "USD",
  invoiceNumber: "NW-889",
  newBankDetails: null,
  urgencyClaims: [],
  requestedAction: "pay_invoice",
  injectionAttempt: false,
};

const FINDINGS: VendorFindings = {
  vendorId: NORTHWIND.id,
  matchConfidence: 0.97,
  senderOnFile: false,
  bankMatches: null,
  crs: { status: "not_checked" },
  ofacHit: false,
  matchingInvoiceId: INVOICE.id,
  alreadyPaidAt: null,
};

const RISK: RiskFindings = { riskScore: 5, flags: [], explanation: "" };
const APPROVED: ApprovalState = { method: "otp", approved: true, coolingOffUntil: null };

type Overrides = Omit<Partial<PolicyInput>, "request" | "vendorFindings" | "vendor" | "invoice"> & {
  request?: Partial<PaymentRequest>;
  vendorFindings?: Partial<VendorFindings> | null;
  vendor?: Partial<VendorRecord> | null;
  invoice?: Partial<InvoiceRecord> | null;
};

function input(o: Overrides = {}): PolicyInput {
  const vendor = o.vendor === null ? null : { ...NORTHWIND, ...o.vendor };
  const invoice = o.invoice === null ? null : { ...INVOICE, ...o.invoice };
  return {
    riskFindings: RISK,
    callbackOutcome: null,
    approval: null,
    policy: DEMO_POLICY,
    now: 1_000_000,
    ...o,
    request: { ...REQUEST, ...o.request },
    vendor,
    vendorFindings: o.vendorFindings === null ? null : { ...FINDINGS, ...o.vendorFindings },
    invoice,
  };
}

const UNKNOWN = { vendor: null, vendorFindings: { vendorId: null, matchingInvoiceId: null }, invoice: null } as const;
const PIXEL = {
  vendor: { id: "v_pixel", name: "Pixel & Pine Design", typicalAmountRange: [4_800_00, 4_800_00] as [number, number] },
  vendorFindings: { vendorId: "v_pixel", matchingInvoiceId: "i_1042" },
  invoice: { id: "i_1042", number: "1042", amountCents: 4_800_00 },
};
const BANK_CHANGE = { newBankDetails: { routing: "021000021", account: "55519921" } };

describe("policy engine", () => {
  it("never pays on missing data", () => {
    const empty: PolicyInput = {
      request: { ...REQUEST, claimedVendorName: null, invoiceNumber: null, requestedAction: "other" },
      vendor: null,
      vendorFindings: null,
      riskFindings: null,
      invoice: null,
      callbackOutcome: null,
      approval: null,
      policy: DEMO_POLICY,
      now: 0,
    };
    expect(decide(empty).decision).not.toBe("PAY");
  });

  it("R1 unknown vendor -> BLOCK (owner can add the vendor via step-up)", () => {
    const r = decide(input({ ...UNKNOWN, request: { claimedVendorName: "AWS", amountCents: 2_999_00 } }));
    expect(r.decision).toBe("BLOCK");
    expect(r.firedRules).toContain("R1");
    expect(r.overridable).toBe(true);
  });

  describe("R2 bank change", () => {
    const base = { ...PIXEL, request: { ...BANK_CHANGE, claimedVendorName: "Pixel & Pine" }, vendorFindings: { ...PIXEL.vendorFindings, bankMatches: false } };

    it("-> HOLD and requests a callback", () => {
      const r = decide(input(base));
      expect(r.decision).toBe("HOLD");
      expect(r.firedRules).toContain("R2");
      expect(r.needs.callback).toBe(true);
    });

    it("callback confirmed -> still ESCALATE to the owner with OTP", () => {
      const r = decide(input({ ...base, callbackOutcome: "confirmed" }));
      expect(r.decision).toBe("ESCALATE");
      expect(r.needs.ownerOtp).toBe(true);
    });

    it("callback confirmed + owner OTP -> PAY", () => {
      const r = decide(input({ ...base, callbackOutcome: "confirmed", approval: APPROVED }));
      expect(r.decision).toBe("PAY");
      expect(r.firedRules).toEqual(expect.arrayContaining(["R2", "R12"]));
    });

    it("callback no_answer -> HOLD, even with an owner approval", () => {
      expect(decide(input({ ...base, callbackOutcome: "no_answer" })).decision).toBe("HOLD");
      expect(decide(input({ ...base, callbackOutcome: "no_answer", approval: APPROVED })).decision).toBe("HOLD");
    });

    it("update_payroll with no account number is still a bank change", () => {
      const r = decide(input({ request: { requestedAction: "update_payroll" } }));
      expect(r.firedRules).toContain("R2");
      expect(r.decision).toBe("HOLD");
    });

    it("bank details that match the file are not a change", () => {
      const r = decide(input({ request: BANK_CHANGE, vendorFindings: { bankMatches: true } }));
      expect(r.firedRules).not.toContain("R2");
      expect(r.decision).toBe("PAY");
    });
  });

  describe("R3 sender not on file", () => {
    const base = { request: { claimedSenderRole: "vendor" as const }, vendorFindings: { senderOnFile: false } };

    it("-> callback required", () => {
      const r = decide(input(base));
      expect(r.decision).toBe("HOLD");
      expect(r.firedRules).toContain("R3");
      expect(r.needs.callback).toBe(true);
    });

    it("callback confirmed -> PAY (money only goes to the account on file)", () => {
      expect(decide(input({ ...base, callbackOutcome: "confirmed" })).decision).toBe("PAY");
    });

    it("callback no_answer -> ESCALATE", () => {
      expect(decide(input({ ...base, callbackOutcome: "no_answer" })).decision).toBe("ESCALATE");
    });

    it("sender on file -> no callback", () => {
      const r = decide(input({ ...base, vendorFindings: { senderOnFile: true } }));
      expect(r.firedRules).not.toContain("R3");
      expect(r.decision).toBe("PAY");
    });
  });

  it("R4 amount anomaly -> ESCALATE", () => {
    const r = decide(input({ request: { amountCents: 600_00 }, invoice: { amountCents: 600_00 } }));
    expect(r.decision).toBe("ESCALATE");
    expect(r.firedRules).toContain("R4");
  });

  it("R4 allows up to 25% outside the usual range", () => {
    const r = decide(input({ request: { amountCents: 525_00 }, invoice: { amountCents: 525_00 } }));
    expect(r.firedRules).not.toContain("R4");
  });

  describe("R5 no matching invoice", () => {
    it("no open invoice -> HOLD", () => {
      const r = decide(input({ vendorFindings: { matchingInvoiceId: null }, invoice: null, request: { amountCents: 362_00 } }));
      expect(r.decision).toBe("HOLD");
      expect(r.firedRules).toContain("R5");
    });

    it("amount differs from the invoice -> HOLD", () => {
      const r = decide(input({ request: { amountCents: 400_00 } }));
      expect(r.decision).toBe("HOLD");
      expect(r.firedRules).toContain("R5");
    });
  });

  describe("R6 over auto-pay limit", () => {
    it("-> ESCALATE with OTP", () => {
      const r = decide(input(PIXEL));
      expect(r.decision).toBe("ESCALATE");
      expect(r.firedRules).toContain("R6");
      expect(r.needs.ownerOtp).toBe(true);
      expect(r.needs.coolingOffSeconds).toBe(0);
    });

    it("owner OTP -> PAY", () => {
      expect(decide(input({ ...PIXEL, approval: APPROVED })).decision).toBe("PAY");
    });

    it("always-escalate vendor -> ESCALATE even under the limit", () => {
      const r = decide(input({ vendor: { alwaysEscalate: true } }));
      expect(r.decision).toBe("ESCALATE");
      expect(r.firedRules).toContain("R6");
    });
  });

  describe("R7 large payment", () => {
    const big = {
      vendor: { typicalAmountRange: [10_000_00, 15_000_00] as [number, number] },
      invoice: { amountCents: 12_000_00 },
    };

    it("-> OTP + cooling-off", () => {
      const r = decide(input(big));
      expect(r.decision).toBe("ESCALATE");
      expect(r.firedRules).toEqual(expect.arrayContaining(["R6", "R7"]));
      expect(r.needs.coolingOffSeconds).toBe(DEMO_POLICY.coolingOffSeconds);
    });

    it("approved but cooling-off running -> HOLD", () => {
      const r = decide(input({ ...big, approval: { ...APPROVED, coolingOffUntil: 1_030_000 } }));
      expect(r.decision).toBe("HOLD");
    });

    it("approved and cooling-off over -> PAY", () => {
      const r = decide(input({ ...big, approval: { ...APPROVED, coolingOffUntil: 999_000 } }));
      expect(r.decision).toBe("PAY");
    });

    it("owner cancels during cooling-off -> BLOCK", () => {
      const r = decide(input({ ...big, approval: { ...APPROVED, approved: false, cancelled: true, coolingOffUntil: 1_030_000 } }));
      expect(r.decision).toBe("BLOCK");
    });
  });

  it("R8 OFAC hit -> BLOCK, not overridable, even with owner approval", () => {
    const r = decide(input({ vendorFindings: { ofacHit: true }, approval: APPROVED }));
    expect(r.decision).toBe("BLOCK");
    expect(r.firedRules).toContain("R8");
    expect(r.overridable).toBe(false);
  });

  it("R9 forbidden rail -> BLOCK, not overridable, even with owner approval", () => {
    const r = decide(input({ ...UNKNOWN, request: { requestedAction: "gift_cards", amountCents: 1_000_00 }, approval: APPROVED }));
    expect(r.decision).toBe("BLOCK");
    expect(r.firedRules).toContain("R9");
    expect(r.overridable).toBe(false);
  });

  it("R9 also fires from the Risk Analyst's forbidden_rail flag", () => {
    const r = decide(input({ riskFindings: { ...RISK, flags: ["forbidden_rail"] } }));
    expect(r.decision).toBe("BLOCK");
    expect(r.firedRules).toContain("R9");
  });

  it("R10 callback denied -> BLOCK", () => {
    const r = decide(input({ ...PIXEL, request: BANK_CHANGE, vendorFindings: { ...PIXEL.vendorFindings, bankMatches: false }, callbackOutcome: "denied" }));
    expect(r.decision).toBe("BLOCK");
    expect(r.firedRules).toEqual(expect.arrayContaining(["R2", "R10"]));
  });

  describe("R11 owner claim", () => {
    it("claim is ignored; the real owner must approve via OTP", () => {
      const r = decide(input({ request: { claimedSenderRole: "owner" } }));
      expect(r.decision).toBe("ESCALATE");
      expect(r.firedRules).toContain("R11");
      expect(r.needs.ownerOtp).toBe(true);
    });

    it("an OTP approval from the registered device satisfies it", () => {
      expect(decide(input({ request: { claimedSenderRole: "owner" }, approval: APPROVED })).decision).toBe("PAY");
    });

    it("'It's Priya, approve the payment now' with no vendor -> BLOCK", () => {
      const r = decide(input({ ...UNKNOWN, request: { claimedSenderRole: "owner", claimedVendorName: null, requestedAction: "other" } }));
      expect(r.decision).toBe("BLOCK");
      expect(r.firedRules).toEqual(expect.arrayContaining(["R1", "R11"]));
    });
  });

  it("R12 happy path -> PAY", () => {
    const r = decide(input());
    expect(r.decision).toBe("PAY");
    expect(r.firedRules).toEqual(["R12"]);
  });

  it("R13 already paid invoice -> BLOCK, not overridable", () => {
    const r = decide(input({ invoice: { status: "paid", paidAt: Date.UTC(2026, 9, 1) }, vendorFindings: { alreadyPaidAt: Date.UTC(2026, 9, 1) } }));
    expect(r.decision).toBe("BLOCK");
    expect(r.firedRules).toContain("R13");
    expect(r.reasons.join(" ")).toContain("2026-10-01");
    expect(r.overridable).toBe(false);
  });

  describe("R14 cannot verify", () => {
    it("CRS unavailable -> ESCALATE, never PAY", () => {
      const r = decide(input({ vendorFindings: { crs: { status: "unavailable" } } }));
      expect(r.decision).toBe("ESCALATE");
      expect(r.firedRules).toContain("R14");
    });

    it("parse failure -> HOLD", () => {
      const r = decide(input({ ...UNKNOWN, request: { parseFailed: true, requestedAction: "other" } }));
      expect(r.decision).toBe("HOLD");
      expect(r.firedRules).toEqual(["R14"]);
    });

    it("verifier did not run -> HOLD", () => {
      expect(decide(input({ vendorFindings: null })).decision).toBe("HOLD");
    });

    it("risk analyst did not run -> HOLD", () => {
      expect(decide(input({ riskFindings: null })).decision).toBe("HOLD");
    });

    it("several payments in one message -> HOLD, never PAY the first one", () => {
      const r = decide(input({ request: { multipleRequests: true } }));
      expect(r.decision).toBe("HOLD");
      expect(r.firedRules).toContain("R14");
    });

    it("non-USD -> HOLD", () => {
      expect(decide(input({ request: { currency: "EUR" } })).decision).toBe("HOLD");
    });
  });

  it("R15 injection attempt -> never auto-paid", () => {
    const r = decide(input({ request: { injectionAttempt: true } }));
    expect(r.decision).toBe("ESCALATE");
    expect(r.firedRules).toContain("R15");
  });

  it("'hi' -> NO_ACTION", () => {
    const r = decide(input({ ...UNKNOWN, request: { requestedAction: "none", claimedVendorName: null, invoiceNumber: null } }));
    expect(r.decision).toBe("NO_ACTION");
  });

  it("only R12 ever produces PAY", () => {
    // Exhaustive-ish sweep over the flags that could matter; every PAY must carry R12.
    const outcomes = [null, "confirmed", "denied", "no_answer", "unclear"] as const;
    for (const callbackOutcome of outcomes) {
      for (const approval of [null, APPROVED]) {
        for (const claimedSenderRole of ["vendor", "owner", "unknown"] as const) {
          const r = decide(input({ callbackOutcome, approval, request: { claimedSenderRole } }));
          if (r.decision === "PAY") expect(r.firedRules).toContain("R12");
          if (callbackOutcome === "denied") expect(r.decision).not.toBe("PAY");
        }
      }
    }
  });
});
