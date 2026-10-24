// Hash-chained audit log (owner: P1). Every state change writes one event:
// hash = sha256(prevHash + canonical(event)), see shared/audit.ts. Append-only: never patch or
// delete these rows. Convex mutations are serializable, so concurrent appends cannot fork the chain.
import { v } from "convex/values";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { GENESIS, hashEvent, verifyEvents } from "../shared/audit";

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
  const hash = await hashEvent(prevHash, { ...event, payload, seq, at });
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
    const { ok, brokenAtSeq } = await verifyEvents(events);
    return { ok, brokenAtSeq, count: events.length };
  },
});
