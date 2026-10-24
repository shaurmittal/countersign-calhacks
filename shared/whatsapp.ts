// WhatsApp Cloud API helpers (owner: P2), used by convex/channels/whatsapp.ts and convex/lib/whatsapp.ts.
// Pure: no Convex or Node imports. WebCrypto is a global in Convex, Node and the browser.
// Payloads: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples

export type InboundMessage = {
  /** Meta's message id ("wamid.…"), the dedupe key. */
  messageId: string;
  /** "+<digits>" (E.164), or the business-scoped user id when Meta withholds the number. */
  from: string;
};
export type InboundText = InboundMessage & { body: string };
export type InboundOther = InboundMessage & { type: string };

/** Message types that get no reply at all: an emoji reaction or a WhatsApp system notice isn't a request. */
const SILENT_TYPES = new Set(["reaction", "system"]);
const MAX_ID_CHARS = 256;

/** The GET handshake: hub.challenge to echo back with 200, or null when the check fails (403). */
export function verifyChallenge(params: URLSearchParams, verifyToken: string | undefined): string | null {
  const challenge = params.get("hub.challenge");
  const given = params.get("hub.verify_token");
  if (!verifyToken || !challenge || !given || params.get("hub.mode") !== "subscribe") return null;
  return constantTimeEqual(given, verifyToken) ? challenge : null;
}

/**
 * X-Hub-Signature-256 is "sha256=" plus the hex HMAC-SHA256 of the raw request body, keyed with the
 * app secret. Hash the bytes exactly as received: JSON parsed and serialised again would not match.
 */
export async function signatureValid(
  rawBody: BufferSource,
  header: string | null,
  appSecret: string | undefined,
): Promise<boolean> {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(header.slice("sha256=".length).toLowerCase(), expected);
}

/** WhatsApp ids are the international number without "+". Returns "+<digits>" (E.164), or "" for anything else. */
export function toE164(raw: string): string {
  const match = /^\+?([1-9]\d{6,14})$/.exec(raw.trim());
  return match ? `+${match[1]}` : "";
}

/**
 * The messages in a webhook body. `texts` open cases. `others` (images, documents, voice notes…)
 * get a reply asking for text. Status callbacks (sent, delivered, read), reactions, system notices
 * and malformed entries are skipped.
 */
export function parseWebhook(payload: unknown): { texts: InboundText[]; others: InboundOther[] } {
  const texts: InboundText[] = [];
  const others: InboundOther[] = [];
  for (const entry of list(prop(payload, "entry"))) {
    for (const change of list(prop(entry, "changes"))) {
      for (const m of list(prop(prop(change, "value"), "messages"))) {
        const messageId = id(prop(m, "id"));
        const type = id(prop(m, "type"));
        // A sender with a WhatsApp username can arrive without `from`; then only their business-scoped id is known.
        const from = toE164(id(prop(m, "from"))) || id(prop(m, "from_user_id"));
        if (!messageId || !type || !from) continue;
        if (type === "text") {
          const body = prop(prop(m, "text"), "body");
          if (typeof body === "string" && body.trim()) texts.push({ messageId, from, body: body.trim() });
        } else if (!SILENT_TYPES.has(type)) {
          others.push({ messageId, from, type });
        }
      }
    }
  }
  return { texts, others };
}

/** Graph API send-message body for a text reply. Phone numbers go in `to`, business-scoped ids in `recipient`. */
export function textMessage(to: string, body: string) {
  const address = to.startsWith("+") ? { to } : { recipient: to };
  return { messaging_product: "whatsapp", recipient_type: "individual", ...address, type: "text", text: { body } };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function prop(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** A trimmed id-like string, or "" when it is missing, blank or too long to be real. */
function id(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length <= MAX_ID_CHARS ? s : "";
}
