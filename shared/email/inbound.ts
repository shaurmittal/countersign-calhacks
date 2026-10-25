// Inbound email (owner: P2). Pure: a Postmark inbound webhook payload in, what openCase needs out.
// Postmark format: https://postmarkapp.com/developer/webhooks/inbound-webhook
//
// Forwarding: when the owner forwards a vendor's email (the usual way invoices reach an assistant), the
// sender that matters is the original one, quoted inside the body. That original From is unauthenticated
// text, so its verdict is "unknown": it can never count as on file, and a callback confirms it instead.
// The forward itself is trusted only when the owner's own address passes authentication.
import { assessEmailAuth, type EmailAuth, type Header } from "./auth";
import { emailDomain, normalizeEmail } from "../verification/text";

export type PostmarkAttachment = { Name?: string; Content?: string; ContentType?: string; ContentLength?: number };

export type PostmarkInbound = {
  From?: string;
  FromName?: string;
  FromFull?: { Email?: string; Name?: string };
  To?: string;
  Subject?: string;
  MessageID?: string;
  ReplyTo?: string;
  Date?: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  Headers?: Header[];
  Attachments?: PostmarkAttachment[];
};

export type EmailAttachmentMeta = {
  name: string;
  contentType: string;
  bytes: number;
  /** Set by the webhook once the PDF is in Convex file storage. */
  storageId?: string;
};

/** Stored on cases.emailSignals. Public queries strip fromName and messageId (see publicEmailSignals). */
export type EmailSignals = {
  subject: string;
  fromDomain: string;
  fromName: string | null;
  messageId: string | null;
  auth: EmailAuth;
  /** Set when the owner forwarded someone else's email; auth then describes the ORIGINAL sender (unknown). */
  forwardedBy: "owner" | null;
  /** Authentication of the outer message when it was a forward. */
  forwardAuth?: EmailAuth;
  attachments: EmailAttachmentMeta[];
  /** The PDF Claude reads, if any (the first one, under MAX_PDF_BYTES). */
  pdf?: EmailAttachmentMeta;
  /** Sent from /try's email attacks: crafted headers, run through this same parser. */
  simulated?: boolean;
};

export type ParsedInbound = {
  fromAddress: string;
  rawContent: string;
  externalId: string | undefined;
  signals: EmailSignals;
  /** Base64 PDF for the webhook to store, or null. */
  pdfBase64: string | null;
};

export const MAX_PDF_BYTES = 2 * 1024 * 1024;
const MAX_BODY_CHARS = 1800; // openCase keeps 2000; leave room for the subject line

const FORWARD_MARKERS = [
  /^-{3,}\s*Forwarded message\s*-{3,}\s*$/im, // Gmail
  /^Begin forwarded message:\s*$/im, // Apple Mail
  /^-{3,}\s*Original Message\s*-{3,}\s*$/im, // Outlook
];

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ");
}

/** Body text without quoted reply history ("> ...") and with runs of blank lines collapsed. */
export function cleanBody(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Forwarded = { from: string; fromName: string | null; replyTo: string | null; subject: string | null; body: string };

/** The original message inside a forward, or null when the body isn't a forward. */
export function parseForward(body: string): Forwarded | null {
  const marker = FORWARD_MARKERS.map((re) => body.match(re)).find((m) => m?.index != null);
  if (!marker || marker.index == null) return null;
  const rest = body.slice(marker.index + marker[0].length).replace(/^\s+/, "");
  const lines = rest.split("\n");
  const header: Record<string, string> = {};
  let i = 0;
  for (; i < Math.min(lines.length, 12); i++) {
    const m = lines[i].match(/^\s*\**(From|Reply-To|Subject|Date|Sent|To|Cc)\**:\s*(.*)$/i);
    if (!m) {
      if (lines[i].trim() === "" && Object.keys(header).length > 0) break;
      continue;
    }
    header[m[1].toLowerCase()] = m[2].trim();
  }
  const fromLine = header.from;
  const from = fromLine ? normalizeEmail(fromLine) : "";
  if (!from) return null;
  const name = fromLine.replace(/<[^>]*>/, "").replace(/["*]/g, "").trim();
  return {
    from,
    fromName: name && name.toLowerCase() !== from ? name : null,
    replyTo: header["reply-to"] ? normalizeEmail(header["reply-to"]) || null : null,
    subject: header.subject ?? null,
    body: lines.slice(i).join("\n").trim(),
  };
}

function firstPdf(attachments: PostmarkAttachment[]): { meta: EmailAttachmentMeta; base64: string } | null {
  for (const a of attachments) {
    const name = a.Name ?? "attachment";
    const isPdf = (a.ContentType ?? "").toLowerCase().includes("pdf") || name.toLowerCase().endsWith(".pdf");
    if (!isPdf || !a.Content) continue;
    const bytes = a.ContentLength ?? Math.floor((a.Content.length * 3) / 4);
    if (bytes > MAX_PDF_BYTES) continue;
    return { meta: { name, contentType: "application/pdf", bytes }, base64: a.Content };
  }
  return null;
}

export function parseInbound(p: PostmarkInbound, opts: { ownerEmail: string | null }): ParsedInbound | { error: string } {
  const outerFrom = normalizeEmail(p.FromFull?.Email ?? p.From ?? "");
  if (!outerFrom) return { error: "no sender address" };
  const outerName = (p.FromFull?.Name ?? p.FromName ?? "").trim() || null;
  const headers = p.Headers ?? [];
  const outerAuth = assessEmailAuth({ headers, from: outerFrom, fromName: outerName, replyTo: p.ReplyTo });

  const rawBody = p.TextBody?.trim() ? p.TextBody : htmlToText(p.HtmlBody ?? "");
  let subject = (p.Subject ?? "").trim();
  let from = outerFrom;
  let fromName = outerName;
  let auth = outerAuth;
  let body = rawBody;
  let forwardedBy: EmailSignals["forwardedBy"] = null;

  const owner = opts.ownerEmail ? normalizeEmail(opts.ownerEmail) : "";
  const forward = owner && outerFrom === owner && outerAuth.verdict === "pass" ? parseForward(rawBody) : null;
  if (forward) {
    forwardedBy = "owner";
    from = forward.from;
    fromName = forward.fromName;
    subject = forward.subject ?? subject.replace(/^(fwd?|fw):\s*/i, "");
    body = forward.body;
    // Nobody vouches for a quoted From line, so the original sender's auth is unknown, never pass.
    const quoted = assessEmailAuth({ headers: [], from, fromName, replyTo: forward.replyTo });
    auth = { ...quoted, verdict: "unknown" };
  }

  const text = cleanBody(body).slice(0, MAX_BODY_CHARS);
  const attachments = (p.Attachments ?? []).map((a) => ({
    name: a.Name ?? "attachment",
    contentType: a.ContentType ?? "application/octet-stream",
    bytes: a.ContentLength ?? Math.floor(((a.Content ?? "").length * 3) / 4),
  }));
  const pdf = firstPdf(p.Attachments ?? []);
  const pdfNote = pdf ? `\n\n[Attached: ${pdf.meta.name}]` : "";

  return {
    fromAddress: from,
    rawContent: `Subject: ${subject || "(no subject)"}\n\n${text || "(no text)"}${pdfNote}`,
    externalId: p.MessageID ? `email:${p.MessageID}` : undefined,
    pdfBase64: pdf?.base64 ?? null,
    signals: {
      subject: subject.slice(0, 200),
      fromDomain: emailDomain(from),
      fromName,
      messageId: p.MessageID ?? null,
      auth,
      forwardedBy,
      ...(forward ? { forwardAuth: outerAuth } : {}),
      attachments,
      ...(pdf ? { pdf: pdf.meta } : {}),
    },
  };
}

/** What public queries may show: no display name (a person's name) and no message id. */
export function publicEmailSignals(s: EmailSignals | undefined | null) {
  if (!s) return null;
  const { fromName, messageId, ...rest } = s;
  void fromName;
  void messageId;
  return { ...rest, pdf: rest.pdf ? { name: rest.pdf.name, bytes: rest.pdf.bytes } : undefined };
}
