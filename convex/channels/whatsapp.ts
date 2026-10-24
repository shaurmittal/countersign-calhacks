// WhatsApp channel (owner: P2). Meta's WhatsApp Cloud API calls /whatsapp/webhook: GET for the
// subscribe handshake, POST for messages, which must carry a valid X-Hub-Signature-256. This path
// only opens cases and sends replies; it can't approve anything or move money. A message from a
// vendor's real number is not proof either: R2/R3 still call the number on file. Setup: docs/whatsapp-setup.md
import { v } from "convex/values";
import { httpAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { LIMITS } from "../../shared/config";
import { parseWebhook, signatureValid, verifyChallenge } from "../../shared/whatsapp";
import { sendWhatsAppText } from "../lib/whatsapp";
import { senderOverLimit } from "../lib/rateLimit";
import { openCase } from "../cases";

const TEXT_ONLY = "Countersign reads text messages only. Please send your payment request as text.";
const SLOW_DOWN = `Slow down: at most ${LIMITS.rateLimitPerSenderPerMinute} messages a minute.`;

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function parseJson(raw: ArrayBuffer): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    console.warn("[whatsapp] signed webhook body is not JSON; ignored");
    return null;
  }
}

/** GET: Meta's subscribe handshake. Echoes hub.challenge only when hub.verify_token matches. */
export const verifyWebhook = httpAction(async (_ctx, request) => {
  const challenge = verifyChallenge(new URL(request.url).searchParams, process.env.WHATSAPP_VERIFY_TOKEN);
  if (challenge === null) {
    console.warn("[whatsapp] webhook verification rejected: wrong hub.mode or hub.verify_token");
    return text("forbidden", 403);
  }
  return text(challenge);
});

/**
 * POST: message notifications. The signature is checked on the raw bytes before anything is parsed.
 * Once it is valid the answer is always 200, because Meta retries anything else for up to 7 days.
 * Repeat deliveries are deduped by openCase on externalId = wa:<message id>.
 */
export const receiveWebhook = httpAction(async (ctx, request) => {
  const raw = await request.arrayBuffer();
  if (!(await signatureValid(raw, request.headers.get("X-Hub-Signature-256"), process.env.WHATSAPP_APP_SECRET))) {
    console.warn("[whatsapp] webhook rejected: bad or missing X-Hub-Signature-256");
    return text("unauthorized", 401);
  }
  const { texts, others } = parseWebhook(parseJson(raw));
  for (const m of texts) {
    try {
      const opened = await ctx.runMutation(internal.channels.whatsapp.openMessageCase, {
        fromAddress: m.from,
        rawContent: m.body,
        externalId: `wa:${m.messageId}`,
      });
      if (opened) {
        console.log(`[whatsapp] message ${m.messageId} case=${opened.caseId}`);
        continue;
      }
      console.warn(`[whatsapp] rate-limited sender=…${m.from.slice(-4)}`);
      await sendWhatsAppText(m.from, SLOW_DOWN);
    } catch (err) {
      console.error(`[whatsapp] message ${m.messageId} not opened: ${String(err).slice(0, 200)}`);
    }
  }
  // Images, documents, voice notes…: no case, just a reply asking for text (spec §8.1).
  for (const m of others) await sendWhatsAppText(m.from, TEXT_ONLY);
  return text("ok");
});

/** Opens a WhatsApp case unless this sender is over the per-minute limit (null). */
export const openMessageCase = internalMutation({
  args: { fromAddress: v.string(), rawContent: v.string(), externalId: v.string() },
  handler: async (ctx, args) => {
    if (await senderOverLimit(ctx, args.fromAddress)) return null;
    return openCase(ctx, { channel: "whatsapp", ...args });
  },
});
