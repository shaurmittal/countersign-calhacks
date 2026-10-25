// Email channel (owner: P2). Postmark Inbound posts every email sent to the Countersign address here:
//   POST https://<deployment>.convex.site/email/inbound
// The webhook URL carries HTTP Basic credentials (https://countersign:<EMAIL_WEBHOOK_SECRET>@...), checked
// in constant time. Each email becomes a case on the same pipeline as every other channel; what the
// receiving server said about the sender's domain rides along as emailSignals for the Vendor Verifier
// and rule R17. A PDF attachment goes to Convex file storage for the Intake Parser (Claude) to read.
// Countersign never sends email: the reply shows in the War Room as an unsent draft.
import { ConvexError, v } from "convex/values";
import { action, httpAction, internalMutation, internalQuery, query, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { openCase } from "../cases";
import { senderOverLimit } from "../lib/rateLimit";
import { appendAudit } from "../audit";
import { emailAttack } from "../../shared/email/attacks";
import { parseInbound, publicEmailSignals, type EmailSignals, type PostmarkInbound } from "../../shared/email/inbound";
import type { PolicyResult } from "../../shared/types";

const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024; // Postmark's own inbound limit is 35 MB; we only need a small PDF
const SENDER_ID = /^[a-zA-Z0-9-]{8,64}$/;
const SIMULATIONS_PER_MINUTE = 5; // each one runs Claude, CRS and sometimes a callback

/** Constant-time string compare, so the secret can't be guessed one character at a time. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** True when the Authorization header carries Basic credentials whose password is the secret. */
export function webhookAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  const password = decoded.slice(decoded.indexOf(":") + 1);
  return safeEqual(password, secret);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const ownerEmail = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("owner").first())?.email ?? null,
});

type IngestResult = { ok: true; caseId: Id<"cases">; duplicate: boolean } | { ok: false; reason: string };

/** Parses the payload, stores a PDF, opens the case. Shared by the webhook and /try's simulated attacks. */
async function ingestPayload(ctx: ActionCtx, payload: PostmarkInbound, simulated: boolean): Promise<IngestResult> {
  const owner = await ctx.runQuery(internal.channels.email.ownerEmail, {});
  const parsed = parseInbound(payload, { ownerEmail: owner });
  if ("error" in parsed) return { ok: false, reason: parsed.error };

  const signals: EmailSignals = { ...parsed.signals, ...(simulated ? { simulated: true } : {}) };
  if (parsed.pdfBase64 && signals.pdf) {
    try {
      const blob = new Blob([base64ToBytes(parsed.pdfBase64)], { type: "application/pdf" });
      signals.pdf = { ...signals.pdf, storageId: await ctx.storage.store(blob) };
    } catch {
      // Not a readable attachment: the case still opens, on the text alone.
      delete signals.pdf;
    }
  }
  return ctx.runMutation(internal.channels.email.ingest, {
    fromAddress: parsed.fromAddress,
    rawContent: parsed.rawContent,
    externalId: simulated ? `sim-${parsed.externalId ?? crypto.randomUUID()}` : parsed.externalId,
    signals,
  });
}

export const ingest = internalMutation({
  args: { fromAddress: v.string(), rawContent: v.string(), externalId: v.optional(v.string()), signals: v.any() },
  handler: async (ctx, { fromAddress, rawContent, externalId, signals }): Promise<IngestResult> => {
    if (!signals.simulated && (await senderOverLimit(ctx, fromAddress))) {
      await appendAudit(ctx, { actor: "system", action: "email.rate_limited", payload: { domain: signals.fromDomain } });
      return { ok: false, reason: "rate limited" };
    }
    const { caseId, duplicate } = await openCase(ctx, {
      channel: "email",
      fromAddress,
      rawContent,
      externalId,
      emailSignals: signals as EmailSignals,
    });
    return { ok: true, caseId, duplicate };
  },
});

/** POST /email/inbound. 200 for anything Postmark shouldn't retry; 401 for a wrong secret. */
export const inbound = httpAction(async (ctx, request) => {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret) return new Response("Email intake is not set up", { status: 503 });
  if (!webhookAuthorized(request.headers.get("Authorization"), secret)) {
    return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="countersign"' } });
  }
  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (length > MAX_PAYLOAD_BYTES) return Response.json({ ok: false, reason: "too large" });

  let payload: PostmarkInbound;
  try {
    payload = (await request.json()) as PostmarkInbound;
  } catch {
    return Response.json({ ok: false, reason: "not JSON" });
  }
  const result = await ingestPayload(ctx, payload, false);
  return Response.json(result.ok ? { ok: true, duplicate: result.duplicate } : result);
});

/**
 * /try's email attacks: a crafted payload (shared/email/attacks.ts) through the same parser and pipeline.
 * Fixed payloads only, nothing from the caller, so this can't be used to inject arbitrary mail.
 */
export const simulateAttack = action({
  args: { attack: v.string(), senderId: v.string() },
  handler: async (ctx, { attack, senderId }): Promise<Id<"cases">> => {
    if (!SENDER_ID.test(senderId)) throw new ConvexError("Invalid session.");
    const found = emailAttack(attack);
    if (!found) throw new ConvexError("Unknown attack.");
    const slot = await ctx.runMutation(internal.channels.email.claimSimulation, { senderId, attack: found.id });
    if (!slot) throw new ConvexError(`Slow down: at most ${SIMULATIONS_PER_MINUTE} attacks a minute.`);
    const result = await ingestPayload(ctx, found.payload(), true);
    if (!result.ok) throw new ConvexError("Couldn't send that one. Try again.");
    await ctx.runMutation(internal.channels.email.attachSimulation, { slot, caseId: result.caseId });
    return result.caseId;
  },
});

/** Per-visitor limit on simulated attacks. Returns the new row, or null when over the limit. */
export const claimSimulation = internalMutation({
  args: { senderId: v.string(), attack: v.string() },
  handler: async (ctx, { senderId, attack }) => {
    const recent = await ctx.db
      .query("emailSimulations")
      .withIndex("by_sender", (q) => q.eq("senderId", senderId))
      .order("desc")
      .take(SIMULATIONS_PER_MINUTE);
    const oneMinuteAgo = Date.now() - 60_000;
    if (recent.length >= SIMULATIONS_PER_MINUTE && recent.every((r) => r.at > oneMinuteAgo)) return null;
    return ctx.db.insert("emailSimulations", { senderId, attack, at: Date.now() });
  },
});

export const attachSimulation = internalMutation({
  args: { slot: v.id("emailSimulations"), caseId: v.id("cases") },
  handler: (ctx, { slot, caseId }) => ctx.db.patch(slot, { caseId }),
});

/** The visitor's own simulated attacks on /try, newest last, with what the War Room already shows in public. */
export const mySimulations = query({
  args: { senderId: v.string() },
  handler: async (ctx, { senderId }) => {
    if (!SENDER_ID.test(senderId)) return [];
    const rows = await ctx.db
      .query("emailSimulations")
      .withIndex("by_sender", (q) => q.eq("senderId", senderId))
      .order("desc")
      .take(10);
    const out = await Promise.all(
      rows.reverse().map(async (r) => {
        const c = r.caseId ? await ctx.db.get(r.caseId) : null;
        if (!c) return null;
        const vendor = c.vendorId ? await ctx.db.get(c.vendorId) : null;
        const policy = c.policyResult as PolicyResult | undefined;
        const settled = c.status === "CLOSED" || c.status === "AWAITING_OWNER";
        return {
          _id: c._id,
          attack: r.attack,
          status: c.status,
          decision: c.decision ?? null,
          reply: c.replyText ?? null,
          vendorName: vendor?.name ?? null,
          rules: policy?.firedRules ?? [],
          reasons: policy?.reasons ?? [],
          email: publicEmailSignals(c.emailSignals as EmailSignals | undefined),
          createdAt: c.createdAt,
          decidedAt: settled && c.decision ? c.updatedAt : null,
        };
      }),
    );
    return out.filter((x) => x !== null);
  },
});
