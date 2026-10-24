// Web chat channel (owner: P2). Replaces SMS: judges scan a QR code, type a request at /try,
// and watch the reply arrive. Same pipeline as every other channel.
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { LIMITS } from "../../shared/config";
import { openCase } from "../cases";

const SENDER_ID = /^[a-zA-Z0-9-]{8,64}$/;

export const submit = mutation({
  args: { text: v.string(), senderId: v.string() },
  handler: async (ctx, { text, senderId }) => {
    const rawContent = text.trim();
    if (!rawContent) throw new ConvexError("Type a message first.");
    if (!SENDER_ID.test(senderId)) throw new ConvexError("Invalid session.");
    const fromAddress = `web:${senderId}`;

    const recent = await ctx.db
      .query("cases")
      .withIndex("by_from", (q) => q.eq("fromAddress", fromAddress))
      .order("desc")
      .take(LIMITS.rateLimitPerSenderPerMinute);
    const oneMinuteAgo = Date.now() - 60_000;
    if (recent.length >= LIMITS.rateLimitPerSenderPerMinute && recent.every((c) => c.createdAt > oneMinuteAgo)) {
      throw new ConvexError("Slow down: at most 10 messages a minute.");
    }

    const { caseId } = await openCase(ctx, { channel: "web", fromAddress, rawContent });
    return caseId;
  },
});

/** The sender's own conversation only. */
export const mine = query({
  args: { senderId: v.string() },
  handler: async (ctx, { senderId }) => {
    if (!SENDER_ID.test(senderId)) return [];
    const cases = await ctx.db
      .query("cases")
      .withIndex("by_from", (q) => q.eq("fromAddress", `web:${senderId}`))
      .order("desc")
      .take(20);
    return cases.reverse().map((c) => ({
      _id: c._id,
      text: c.rawContent,
      status: c.status,
      decision: c.decision ?? null,
      reply: c.replyText ?? null,
      createdAt: c.createdAt,
    }));
  },
});
