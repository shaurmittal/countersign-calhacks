// Agent channel (owner: P4). The Countersign uAgent (fetch-agents/countersign_agent.py) is the
// only caller: every route needs the X-Agent-Bridge-Secret header. The agent forwards Chat
// Protocol messages here, polls for the reply, and relays the owner's ASI:One commands.
//
//   POST /agent/message   { sender, text, msgId }      -> { caseId, ref }   opens an "agent" case
//   GET  /agent/case?id=                                -> { status, decision, reply, rules }
//   GET  /agent/pending                                 -> cases waiting for the owner
//   POST /agent/approval  { ref, code, action }         -> { ok, message | error }
import { v } from "convex/values";
import { httpAction, internalQuery } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { caseRef } from "../lib/caseView";
import { formatCents } from "../../shared/ledger";
import { LIMITS } from "../../shared/config";
import type { PolicyResult } from "../../shared/types";

const SECRET_HEADER = "X-Agent-Bridge-Secret";
const MAX_ID_CHARS = 128;
const RATE_WINDOW_MS = 60_000;
const OWNER_ACTIONS = new Set(["approve", "decline", "cancel"]);
const REF_PATTERN = /^[a-z0-9]{6}$/;

export const inboundMessage = httpAction(async (ctx, request) => {
  if (!authorized(request)) return json({ error: "unauthorized" }, 401);
  const body = await readJson(request);
  const sender = shortString(body?.sender);
  const msgId = shortString(body?.msgId);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!sender || !msgId || !text) return json({ error: "sender, msgId and text are required" }, 400);

  const recent = await ctx.runQuery(internal.channels.agentBridge.messagesSince, {
    fromAddress: sender,
    since: Date.now() - RATE_WINDOW_MS,
  });
  if (recent >= LIMITS.rateLimitPerSenderPerMinute) {
    return json({ error: "Slow down: at most 10 messages a minute." }, 429, { "Retry-After": "60" });
  }

  const { caseId } = await ctx.runMutation(internal.cases.open, {
    channel: "agent",
    fromAddress: sender,
    rawContent: text,
    externalId: `agent:${msgId}`,
  });
  return json({ caseId, ref: caseRef(caseId) });
});

export const caseStatus = httpAction(async (ctx, request) => {
  if (!authorized(request)) return json({ error: "unauthorized" }, 401);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const status = await ctx.runQuery(internal.channels.agentBridge.statusFor, { caseId: id });
  return status ? json(status) : json({ error: "case not found" }, 404);
});

export const pendingApprovals = httpAction(async (ctx, request) => {
  if (!authorized(request)) return json({ error: "unauthorized" }, 401);
  const pending = await ctx.runQuery(api.owner.pending, {});
  return json({
    pending: pending.map((p) => ({
      ref: p.ref,
      vendor: p.vendorName ?? "unknown payee",
      amount: p.amountCents != null ? formatCents(p.amountCents) : null,
      rules: p.firedRules,
      reasons: p.reasons,
      approved: !!p.approval?.approvedAt,
      coolingOffUntil: p.approval?.coolingOffUntil ?? null,
    })),
  });
});

export const ownerApproval = httpAction(async (ctx, request) => {
  if (!authorized(request)) return json({ error: "unauthorized" }, 401);
  const body = await readJson(request);
  const ref = typeof body?.ref === "string" ? body.ref.trim().toLowerCase() : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const action = typeof body?.action === "string" ? body.action : "";
  if (!REF_PATTERN.test(ref) || !OWNER_ACTIONS.has(action)) {
    return json({ ok: false, error: "Use: approve <ref> <code>, decline <ref> <code> or cancel <ref> <code>." }, 400);
  }
  const pending = await ctx.runQuery(api.owner.pending, {});
  const match = pending.find((p) => p.ref === ref);
  if (!match) return json({ ok: false, error: `No case ${ref} is waiting for you. Say "pending" to list them.` }, 404);

  const result = await ctx.runMutation(internal.agents.ownerConcierge.submitCodeFromAgent, {
    caseId: match.caseId,
    code,
    action: action as "approve" | "decline" | "cancel",
  });
  return json(result, result.ok ? 200 : 422);
});

export const messagesSince = internalQuery({
  args: { fromAddress: v.string(), since: v.number() },
  handler: async (ctx, { fromAddress, since }) => {
    const recent = await ctx.db
      .query("cases")
      .withIndex("by_from", (q) => q.eq("fromAddress", fromAddress))
      .order("desc")
      .take(LIMITS.rateLimitPerSenderPerMinute);
    return recent.filter((c) => c.createdAt > since).length;
  },
});

export const statusFor = internalQuery({
  args: { caseId: v.string() },
  handler: async (ctx, { caseId }) => {
    const id = ctx.db.normalizeId("cases", caseId);
    const c = id ? await ctx.db.get(id) : null;
    if (!c || c.channel !== "agent") return null;
    return {
      ref: caseRef(c._id),
      status: c.status,
      decision: c.decision ?? null,
      reply: c.replyText ?? null,
      rules: (c.policyResult as PolicyResult | undefined)?.firedRules ?? [],
    };
  },
});

function authorized(request: Request): boolean {
  const expected = process.env.AGENT_BRIDGE_SECRET;
  const given = request.headers.get(SECRET_HEADER);
  return !!expected && !!given && constantTimeEqual(given, expected);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function shortString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_CHARS ? value : null;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers });
}
