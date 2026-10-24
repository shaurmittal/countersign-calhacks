// Delivers cases.replyText on the channel the request came in on.
//   web:   nothing to send; /try subscribes to the case and shows the reply live
//   call:  nothing to send; the voice agent reads it via get_case_status
//   agent: P4, reply through the Fetch.ai bridge
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

export const dispatch = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.runQuery(internal.cases.get, { caseId });
    if (!c?.replyText) return;
    switch (c.channel) {
      case "agent":
        // TODO(P4): reply through the Fetch.ai bridge.
        break;
      default:
        break;
    }
  },
});
