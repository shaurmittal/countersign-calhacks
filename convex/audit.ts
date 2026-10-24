// Hash-chained audit log (owner: P1). Every state change writes one event:
// hash = sha256(prevHash + canonical(event)). Append-only: never patch or delete these rows.
import { v } from "convex/values";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const GENESIS = "0".repeat(64);

async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function canonical(e: { seq: number; caseId?: string; actor: string; action: string; payload: unknown; at: number }) {
  return JSON.stringify([e.seq, e.caseId ?? null, e.actor, e.action, e.payload ?? null, e.at]);
}

/** Call from any mutation. Use `internal.audit.append` from actions. */
export async function appendAudit(
  ctx: MutationCtx,
  event: { caseId?: Id<"cases">; actor: string; action: string; payload?: unknown },
) {
  const last = await ctx.db.query("auditEvents").withIndex("by_seq").order("desc").first();
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? GENESIS;
  const at = Date.now();
  const payload = event.payload ?? null;
  const hash = await sha256Hex(prevHash + canonical({ ...event, payload, seq, at }));
  return ctx.db.insert("auditEvents", { ...event, payload, seq, prevHash, hash, at });
}

export const append = internalMutation({
  args: { caseId: v.optional(v.id("cases")), actor: v.string(), action: v.string(), payload: v.optional(v.any()) },
  handler: (ctx, args) => appendAudit(ctx, args),
});

export const forCase = query({
  args: { caseId: v.id("cases") },
  handler: (ctx, { caseId }) =>
    ctx.db.query("auditEvents").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect(),
});

/** Recomputes the whole chain. Show this in the War Room: "chain verified ✓". */
export const verifyChain = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("auditEvents").withIndex("by_seq").collect();
    let prevHash = GENESIS;
    for (const e of events) {
      const expected = await sha256Hex(prevHash + canonical({ ...e, caseId: e.caseId ?? undefined }));
      if (e.prevHash !== prevHash || e.hash !== expected) return { ok: false, brokenAtSeq: e.seq, count: events.length };
      prevHash = e.hash;
    }
    return { ok: true, brokenAtSeq: null, count: events.length };
  },
});
