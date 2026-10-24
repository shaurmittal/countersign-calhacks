// Case lifecycle (owner: P1). Channels call `open`; the pipeline moves the status forward.
import { v } from "convex/values";
import { internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { caseStatus, channel, decision } from "./schema";
import { appendAudit } from "./audit";
import { LIMITS } from "../shared/config";
import type { Channel } from "../shared/types";

type OpenArgs = { channel: Channel; fromAddress: string; rawContent: string; externalId?: string };

/** Entry point for every channel. Dedupes on externalId (webhook retries) and starts the pipeline. */
export async function openCase(ctx: MutationCtx, args: OpenArgs) {
  if (args.externalId) {
    const dupe = await ctx.db
      .query("cases")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .first();
    if (dupe) return { caseId: dupe._id, duplicate: true };
  }
  const now = Date.now();
  const caseId = await ctx.db.insert("cases", {
    ...args,
    rawContent: args.rawContent.slice(0, LIMITS.maxMessageChars),
    status: "RECEIVED",
    flags: [],
    createdAt: now,
    updatedAt: now,
  });
  await appendAudit(ctx, { caseId, actor: "system", action: "case.opened", payload: { channel: args.channel } });
  await ctx.scheduler.runAfter(0, internal.pipeline.advance, { caseId });
  return { caseId, duplicate: false };
}

export const open = internalMutation({
  args: { channel, fromAddress: v.string(), rawContent: v.string(), externalId: v.optional(v.string()) },
  handler: (ctx, args) => openCase(ctx, args),
});

export const get = internalQuery({
  args: { caseId: v.id("cases") },
  handler: (ctx, { caseId }) => ctx.db.get(caseId),
});

/** Partial update + audit event. Only pass fields that changed. */
export const update = internalMutation({
  args: {
    caseId: v.id("cases"),
    status: v.optional(caseStatus),
    request: v.optional(v.any()),
    vendorId: v.optional(v.id("vendors")),
    vendorFindings: v.optional(v.any()),
    riskFindings: v.optional(v.any()),
    policyResult: v.optional(v.any()),
    decision: v.optional(decision),
    riskScore: v.optional(v.number()),
    flags: v.optional(v.array(v.string())),
    replyText: v.optional(v.string()),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, { caseId, actor, ...patch }) => {
    const fields = Object.fromEntries(Object.entries(patch).filter(([, val]) => val !== undefined));
    await ctx.db.patch(caseId, { ...fields, updatedAt: Date.now() });
    await appendAudit(ctx, { caseId, actor: actor ?? "system", action: "case.updated", payload: fields });
  },
});

// ---- Public queries for the War Room. Only the last 4 of a sender's address leave the backend. ----

function mask(c: Doc<"cases">) {
  return { ...c, fromAddress: `…${c.fromAddress.slice(-4)}` };
}

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) =>
    (await ctx.db.query("cases").withIndex("by_createdAt").order("desc").take(limit ?? 20)).map(mask),
});

export const byId = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.db.get(caseId);
    return c && mask(c);
  },
});
