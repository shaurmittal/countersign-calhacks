// Delivers cases.replyText on the channel the request came in on.
//   web:   nothing to send; /try subscribes to the case and shows the reply live
//   call:  nothing to send; the voice agent reads it via get_case_status
//   agent: nothing to send; the Countersign uAgent polls GET /agent/case and relays it
//   whatsapp: a Graph API text message to the sender (lib/whatsapp.ts); a failed send is only logged
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { sendWhatsAppText } from "../lib/whatsapp";

export const dispatch = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.runQuery(internal.cases.get, { caseId });
    if (!c?.replyText) return;
    switch (c.channel) {
      case "agent":
        // fetch-agents/countersign_agent.py polls GET /agent/case and relays replyText.
        break;
      case "whatsapp":
        // Logs a failed send instead of throwing; the case has already been updated by then.
        await sendWhatsAppText(c.fromAddress, c.replyText);
        break;
      default:
        break;
    }
  },
});
