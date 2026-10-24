// Sends cases.replyText back on the channel the request came in on.
// sms/call: P2 · agent: P4 · email: stretch.
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

export const dispatch = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.runQuery(internal.cases.get, { caseId });
    if (!c?.replyText) return;
    switch (c.channel) {
      case "sms":
        await ctx.runAction(internal.channels.sms.send, { to: c.fromAddress, body: c.replyText });
        break;
      case "call":
        // TODO(P2): the live voice agent reads replyText via its tool webhook.
        break;
      case "agent":
        // TODO(P4): reply through the Fetch.ai bridge.
        break;
      case "email":
        // Stretch.
        break;
    }
  },
});
