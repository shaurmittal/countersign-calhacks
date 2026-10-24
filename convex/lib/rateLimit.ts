import type { QueryCtx } from "../_generated/server";
import { LIMITS } from "../../shared/config";

/** True if this sender already opened LIMITS.rateLimitPerSenderPerMinute cases in the last minute (spec §8.4). */
export async function senderOverLimit(ctx: QueryCtx, fromAddress: string): Promise<boolean> {
  const recent = await ctx.db
    .query("cases")
    .withIndex("by_from", (q) => q.eq("fromAddress", fromAddress))
    .order("desc")
    .take(LIMITS.rateLimitPerSenderPerMinute);
  const oneMinuteAgo = Date.now() - 60_000;
  return recent.length >= LIMITS.rateLimitPerSenderPerMinute && recent.every((c) => c.createdAt > oneMinuteAgo);
}
