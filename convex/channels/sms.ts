// SMS channel (owner: P2). Twilio inbound webhook + outbound send.
import { v } from "convex/values";
import { httpAction, internalAction } from "../_generated/server";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** POST /twilio/sms (form-encoded from Twilio). */
export const inbound = httpAction(async (ctx, request) => {
  // TODO(P2): validate X-Twilio-Signature, rate-limit per sender, then
  // ctx.runMutation(internal.cases.open, { channel: "sms", fromAddress: From, rawContent: Body, externalId: MessageSid })
  void ctx;
  void request;
  return new Response(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
});

export const send = internalAction({
  args: { to: v.string(), body: v.string() },
  handler: async (ctx, { to, body }) => {
    // TODO(P2): Twilio Messages API (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER).
    void ctx;
    console.log(`[sms -> ${to.slice(-4)}] ${body}`);
  },
});
