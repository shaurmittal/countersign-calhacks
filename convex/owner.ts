// Owner page queries (owner: P4). Anyone with the URL can see what is waiting, but only the
// authenticator code can act on it (agents/ownerConcierge.ts submitCode).
import { query, type QueryCtx } from "./_generated/server";
import { caseRef, latestApproval, publicApproval, summarizeCase } from "./lib/caseView";

const RECENT_CASES_SCANNED = 100;
const FEED_EVENTS_SCANNED = 300;
const FEED_LENGTH = 20;

/** Cases waiting for the owner: not yet approved, or approved and cooling off. Newest first. */
export async function listPending(ctx: { db: QueryCtx["db"] }) {
  const recent = await ctx.db.query("cases").withIndex("by_createdAt").order("desc").take(RECENT_CASES_SCANNED);
  const waiting = recent.filter((c) => c.status === "AWAITING_OWNER");
  return Promise.all(
    waiting.map(async (c) => {
      const approval = await latestApproval(ctx, c._id);
      return {
        caseId: c._id,
        ref: caseRef(c._id),
        channel: c.channel,
        createdAt: c.createdAt,
        decision: c.decision ?? null,
        ...(await summarizeCase(ctx, c)),
        approval: approval && publicApproval(approval),
      };
    }),
  );
}

export const pending = query({
  args: {},
  handler: (ctx) => listPending(ctx),
});

/** Owner alerts, newest first. Written by ownerConcierge as `owner.notified` audit events. */
export const feed = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("auditEvents").withIndex("by_seq").order("desc").take(FEED_EVENTS_SCANNED);
    return events
      .filter((e) => e.action === "owner.notified")
      .slice(0, FEED_LENGTH)
      .map((e) => ({
        _id: e._id,
        at: e.at,
        caseRef: e.caseId ? caseRef(e.caseId) : null,
        text: String((e.payload as { text?: unknown } | null)?.text ?? ""),
      }));
  },
});
