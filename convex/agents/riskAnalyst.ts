// Risk Analyst (owner: P3). Spec §6.3.
// Rule-based flags; Claude writes a two-sentence explanation. It never decides anything.
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { PaymentRequest, RiskFindings } from "../../shared/types";

export async function runRiskAnalyst(
  ctx: ActionCtx,
  c: Doc<"cases">,
  request: PaymentRequest,
): Promise<RiskFindings> {
  // TODO(P3): bank_change, urgency, new_sender, lookalike_domain, amount_anomaly, off_hours,
  // forbidden_rail, owner_impersonation, injection_attempt.
  void ctx;
  void c;
  return {
    riskScore: 0,
    flags: request.injectionAttempt ? ["injection_attempt"] : [],
    explanation: "",
  };
}
