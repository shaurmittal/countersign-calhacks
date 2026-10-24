// Voice channel (owner: P2). Inbound calls to the Countersign number -> Cartesia agent;
// Cartesia tool webhooks into Convex; outbound callback status from Twilio.
import { httpAction } from "../_generated/server";

/** POST /twilio/voice: Twilio inbound call webhook. */
export const inboundCall = httpAction(async (ctx, request) => {
  // TODO(P2): return TwiML connecting the call to the Cartesia agent; open a "call" case.
  void ctx;
  void request;
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Countersign is not set up yet.</Say></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
});

/** POST /cartesia/tools: tool calls from the Cartesia voice agent (lookup vendor, submit request, get decision). */
export const cartesiaTools = httpAction(async (ctx, request) => {
  // TODO(P2): verify a shared secret header, dispatch by tool name. No tool may move money.
  void ctx;
  void request;
  return Response.json({ error: "not implemented" }, { status: 501 });
});

/** POST /twilio/callback-status: status updates for outbound callback calls. */
export const callbackStatus = httpAction(async (ctx, request) => {
  // TODO(P2): map no-answer/busy/failed -> recordOutcome("no_answer").
  void ctx;
  void request;
  return new Response(null, { status: 204 });
});
