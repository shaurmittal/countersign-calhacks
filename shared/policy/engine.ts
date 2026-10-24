// Policy Engine (owner: P1). The ONLY code that can say PAY.
// Rules: pure function, no LLM, no I/O, no Date.now() (use input.now). Unit-test every rule.
import type { PolicyInput, PolicyResult } from "../types";

export function decide(input: PolicyInput): PolicyResult {
  // TODO(P1): implement R1-R12 from spec §5.
  // Until then, every case HOLDs, which is safe: nothing can be paid.
  void input;
  return {
    decision: "HOLD",
    firedRules: [],
    reasons: ["Policy Engine not implemented yet: default HOLD"],
    needs: { callback: false, ownerOtp: false, coolingOffSeconds: 0 },
    overridable: true,
  };
}
