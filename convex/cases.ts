// Case lifecycle (owner: P1). Channels call `open`; the pipeline moves the status forward.
import { v } from "convex/values";
import { internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { caseStatus, channel, decision } from "./schema";
import { appendAudit } from "./audit";
import { LIMITS } from "../shared/config";
import type { Channel, PaymentRequest, PolicyResult } from "../shared/types";
import { isOwnerAddress, senderMatchesVendor } from "../shared/verification/vendorMatch";
import { latestApproval } from "./lib/caseView";

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

/**
 * Atomic lock taken right before the Payer runs. Convex mutations are serializable, so if two
 * pipeline runs race, exactly one gets `true`. The Payer's idempotency key is the second guard.
 */
export const claimPayment = internalMutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.db.get(caseId);
    if (!c || c.payStartedAt || c.status === "CLOSED") return false;
    // The run that reached PAY decided on an approval it loaded earlier; a cancel that landed since then
    // wins. Checked inside the lock's own transaction, so there is no window between them.
    if ((await latestApproval(ctx, caseId))?.cancelledAt) return false;
    await ctx.db.patch(caseId, { payStartedAt: Date.now(), updatedAt: Date.now() });
    await appendAudit(ctx, { caseId, actor: "policy", action: "payment.claimed" });
    return true;
  },
});

/**
 * After R2 was satisfied (vendor confirmed by callback AND owner approved via step-up), the new
 * bank details become the vendor's details on file. Only the last 4 go in the audit payload.
 */
export const applyConfirmedBankChange = internalMutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.db.get(caseId);
    const bank = (c?.request as PaymentRequest | undefined)?.newBankDetails;
    const policyResult = c?.policyResult as PolicyResult | undefined;
    if (!c?.vendorId || !bank || policyResult?.decision !== "PAY" || !policyResult.firedRules.includes("R2")) {
      throw new Error("applyConfirmedBankChange: case is not an approved bank change");
    }
    const vendor = await ctx.db.get(c.vendorId);
    if (!vendor) throw new Error("vendor not found");
    const patch = {
      ...(bank.routing && { bankRouting: bank.routing }),
      ...(bank.account && { bankLast4: bank.account.slice(-4) }),
    };
    await ctx.db.patch(vendor._id, patch);
    await appendAudit(ctx, {
      caseId,
      actor: "owner",
      action: "vendor.bank_updated",
      payload: { vendorId: vendor._id, fromLast4: vendor.bankLast4, toLast4: patch.bankLast4 ?? vendor.bankLast4 },
    });
  },
});

/** R10: the vendor denied the request, so this sender address is known-bad for that vendor. */
export const markSenderKnownBad = internalMutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.db.get(caseId);
    if (!c?.vendorId) return;
    const vendor = await ctx.db.get(c.vendorId);
    if (!vendor) return;
    // A denied request "from" the vendor's own number or the owner's address was spoofed (spec §8.2).
    // Listing that address would make every later message from the real vendor read as known-bad.
    const owner = await ctx.db.query("owner").first();
    if (senderMatchesVendor(c.fromAddress, vendor) || isOwnerAddress(c.fromAddress, owner)) return;
    const known = vendor.knownBadSenders ?? [];
    if (known.includes(c.fromAddress)) return;
    await ctx.db.patch(vendor._id, { knownBadSenders: [...known, c.fromAddress] });
    await appendAudit(ctx, {
      caseId,
      actor: "policy",
      action: "vendor.sender_marked_bad",
      payload: { vendorId: vendor._id, senderLast4: c.fromAddress.slice(-4) },
    });
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
