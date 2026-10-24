// Owner Concierge (owner: P4). Spec §6.5.
// Step-up approval: OTP to owner.otpPhone (or an ASI:One approval card), cooling-off via the
// scheduler. Never accept approval through the channel the request came in on, and never by voice.
//
// Contract with the pipeline:
//   pipeline schedules  internal.agents.ownerConcierge.requestApproval({ caseId })
//   once approved (and cooling-off has passed), schedule internal.pipeline.advance({ caseId })
import { v } from "convex/values";
import { internalAction } from "../_generated/server";

export const requestApproval = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    // TODO(P4): insert approvals row (store a hash of the OTP), send OTP, start cooling-off timer.
    void ctx;
    void caseId;
  },
});

export const notifyOwner = internalAction({
  args: { caseId: v.id("cases"), text: v.string() },
  handler: async (ctx, { caseId, text }) => {
    // TODO(P4): SMS / ASI:One alert to the owner with the decision and rule IDs.
    void ctx;
    void caseId;
    console.log(`[owner alert] ${text}`);
  },
});

// TODO(P4): submitOtp mutation (verify hash, set approvedAt, coolingOffUntil), cancel mutation.
