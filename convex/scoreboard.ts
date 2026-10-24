// Top-bar scoreboard (owner: P4). Spec §7.2. Computed from real cases only.
import { query } from "./_generated/server";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const cases = await ctx.db.query("cases").collect();
    const closed = cases.filter((c) => c.status === "CLOSED" && c.decision);
    const blocked = closed.filter((c) => c.decision === "BLOCK" || c.decision === "HOLD" || c.decision === "ESCALATE");
    const paid = closed.filter((c) => c.decision === "PAY");
    const times = closed.map((c) => c.updatedAt - c.createdAt).sort((a, b) => a - b);
    const median = times.length ? times[Math.floor(times.length / 2)] : null;
    // TODO(P4): "dollars lost" should stay $0 by construction; count scam attempts from flags/rules.
    return {
      scamAttempts: blocked.length,
      dollarsLostCents: 0,
      realBillsPaid: paid.length,
      medianDecisionMs: median,
    };
  },
});
