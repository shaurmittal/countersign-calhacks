// Agent channel (owner: P4). The Fetch.ai uAgents in fetch-agents/ forward chat-protocol
// messages here, and approvals from ASI:One.
import { httpAction } from "../_generated/server";

/** POST /agent/message  { sender: string, text: string, msgId: string } */
export const inboundMessage = httpAction(async (ctx, request) => {
  // TODO(P4): check AGENT_BRIDGE_SECRET header, then
  // ctx.runMutation(internal.cases.open, { channel: "agent", fromAddress: sender, rawContent: text, externalId: msgId })
  void ctx;
  void request;
  return Response.json({ error: "not implemented" }, { status: 501 });
});
