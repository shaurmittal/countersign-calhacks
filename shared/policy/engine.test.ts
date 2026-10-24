import { describe, expect, it } from "vitest";
import { DEMO_POLICY } from "../config";
import type { PaymentRequest, PolicyInput } from "../types";
import { decide } from "./engine";

const baseRequest: PaymentRequest = {
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

function input(overrides: Partial<PolicyInput> = {}): PolicyInput {
  return {
    request: baseRequest,
    vendor: null,
    vendorFindings: null,
    riskFindings: null,
    callbackOutcome: null,
    approval: null,
    policy: DEMO_POLICY,
    now: 0,
    ...overrides,
  };
}

describe("policy engine", () => {
  it("never pays on missing data", () => {
    expect(decide(input()).decision).not.toBe("PAY");
  });

  // TODO(P1): one test per rule. Judges will ask "what happens if...".
  it.todo("R1 unknown vendor -> BLOCK");
  it.todo("R2 bank change -> callback, HOLD until confirmed, then ESCALATE");
  it.todo("R3 sender not on file -> callback required");
  it.todo("R4 amount anomaly -> ESCALATE");
  it.todo("R5 no matching invoice -> HOLD");
  it.todo("R6 over auto-pay limit -> ESCALATE with OTP");
  it.todo("R7 large payment -> OTP + cooling-off");
  it.todo("R8 OFAC hit -> BLOCK, not overridable");
  it.todo("R9 forbidden rail -> BLOCK, not overridable");
  it.todo("R10 callback denied -> BLOCK");
  it.todo("R11 owner claim -> ignored, owner acts only via OTP");
  it.todo("R12 happy path -> PAY");
  it.todo("CRS unavailable -> ESCALATE, never PAY");
  it.todo("already paid invoice -> BLOCK");
});
