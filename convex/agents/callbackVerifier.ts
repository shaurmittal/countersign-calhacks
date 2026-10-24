// Callback Verifier (owner: P2). Spec §6.4.
// Dials vendors.phoneOnFile ONLY. The number is read from the database here and never taken
// from model output or the request. Anything other than a clear "confirmed" is not verified.
//
// Contract with the pipeline:
//   pipeline schedules  internal.agents.callbackVerifier.start({ caseId })
//   when the call ends, call internal.agents.callbackVerifier.recordOutcome(...)
//   recordOutcome re-runs the pipeline, which then reads the outcome.
import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { appendAudit } from "../audit";

export const start = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    // TODO(P2): load the vendor, insert a callbacks row, place the outbound call
    // (Twilio + Cartesia), finish the "callback" agentRun when the outcome is known.
    void ctx;
    void caseId;
  },
});

export const recordOutcome = internalMutation({
  args: {
    callbackId: v.id("callbacks"),
    outcome: v.union(v.literal("confirmed"), v.literal("denied"), v.literal("no_answer"), v.literal("unclear")),
    transcript: v.optional(v.string()),
    recordingUrl: v.optional(v.string()),
  },
  handler: async (ctx, { callbackId, ...result }) => {
    const cb = await ctx.db.get(callbackId);
    if (!cb) throw new Error(`callback ${callbackId} not found`);
    await ctx.db.patch(callbackId, { ...result, endedAt: Date.now() });
    await appendAudit(ctx, {
      caseId: cb.caseId,
      actor: "callback",
      action: "callback.outcome",
      payload: { outcome: result.outcome, numberDialed: cb.numberDialed },
    });
    await ctx.scheduler.runAfter(0, internal.pipeline.advance, { caseId: cb.caseId });
  },
});
