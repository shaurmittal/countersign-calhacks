// WhatsApp Cloud API client (owner: P2). Env vars and Meta app setup: docs/whatsapp-setup.md
import { textMessage } from "../../shared/whatsapp";

/** Newest Graph API version on 2026-10-24: https://developers.facebook.com/docs/graph-api/changelog */
const DEFAULT_GRAPH_VERSION = "v26.0";

/**
 * Sends one text message from WHATSAPP_PHONE_NUMBER_ID. Never throws: a missing setting or a failed
 * send is logged (never the token) and returns false, so the case still closes. WhatsApp delivers
 * free-form text only within 24 hours of the person's last message to us.
 */
export async function sendWhatsAppText(to: string, body: string): Promise<boolean> {
  const who = `…${to.slice(-4)}`;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    console.log(`[whatsapp] not configured, reply to ${who} not sent: ${body}`);
    return false;
  }
  const version = process.env.WHATSAPP_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(textMessage(to, body)),
    });
    if (res.ok) return true;
    // Graph API errors look like { error: { code, message } } and don't echo the token.
    const parsed = (await res.json().catch(() => null)) as { error?: { code?: number; message?: string } } | null;
    const error = parsed?.error;
    console.warn(
      `[whatsapp] reply to ${who} failed: HTTP ${res.status} code=${error?.code ?? "-"} ${(error?.message ?? "").slice(0, 200)}`,
    );
  } catch (err) {
    console.warn(`[whatsapp] reply to ${who} failed: ${String(err).slice(0, 200)}`);
  }
  return false;
}
