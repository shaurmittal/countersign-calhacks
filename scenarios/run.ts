// Scenario runner shared by scenarios.test.ts (CI) and scripts/eval-intake.ts (live Claude).
import { DEMO_POLICY } from "../shared/config";
import { decide } from "../shared/policy/engine";
import type { CallbackOutcome, Channel, Decision, PaymentRequest, PolicyResult, RuleId } from "../shared/types";
import { referenceFindings, referenceRisk, type WorldOverrides } from "./world";
import data from "./scenarios.json";

export type Scenario = {
  id: string;
  scam: boolean;
  channel: Channel;
  from: string;
  text: string;
  request: Partial<PaymentRequest>;
  world?: WorldOverrides;
  callbackOutcome?: CallbackOutcome;
  approval?: "otp";
  expectedDecision: Decision;
  expectedRules: RuleId[];
  expectOverridable?: boolean;
};

export const DEFAULT_REQUEST: PaymentRequest = {
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

export const SCENARIOS = data.scenarios as Scenario[];

export function runScenario(s: Scenario, request: PaymentRequest = { ...DEFAULT_REQUEST, ...s.request }): PolicyResult {
  const { vendor, findings, invoice } = referenceFindings(request, s.from, s.world, s.channel);
  return decide({
    request,
    vendor,
    vendorFindings: request.requestedAction === "none" ? null : findings,
    riskFindings: referenceRisk(request),
    invoice,
    callbackOutcome: s.callbackOutcome ?? null,
    approval: s.approval ? { method: "otp", approved: true, coolingOffUntil: null } : null,
    policy: DEMO_POLICY,
    now: Date.UTC(2026, 9, 24, 12),
  });
}

export function summaryLine(rs: { s: Scenario; r: PolicyResult }[]): string {
  const scams = rs.filter(({ s }) => s.scam);
  const legit = rs.filter(({ s }) => !s.scam);
  const scamsStopped = scams.filter(({ r }) => r.decision !== "PAY").length;
  const legitOk = legit.filter(({ s, r }) => r.decision === s.expectedDecision).length;
  const falsePay = rs.filter(({ s, r }) => r.decision === "PAY" && s.expectedDecision !== "PAY").length;
  return `${rs.length} scenarios · ${scamsStopped}/${scams.length} scams blocked · ${legitOk}/${legit.length} legitimate paid or correctly escalated · ${falsePay} false PAY`;
}
