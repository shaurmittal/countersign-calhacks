// Callback calls for the War Room (owner: P2). Only the last 4 of the number dialed leave the backend.
import { v } from "convex/values";
import { query } from "./_generated/server";

export const forCase = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const rows = await ctx.db
      .query("callbacks")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();
    return Promise.all(
      rows.map(async (cb) => {
        const vendor = await ctx.db.get(cb.vendorId);
        return {
          _id: cb._id,
          attempt: cb.attempt,
          vendorName: vendor?.name ?? null,
          numberDialedLast4: cb.numberDialed.slice(-4),
          outcome: cb.outcome ?? null,
          summary: cb.summary ?? null,
          transcript: cb.transcript ?? null, // "Countersign: …" / "<Vendor>: …" lines; null until fetched
          startedAt: cb.startedAt,
          endedAt: cb.endedAt ?? null,
        };
      }),
    );
  },
});
