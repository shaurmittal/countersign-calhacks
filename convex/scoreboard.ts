// Top-bar scoreboard (owner: P4). Spec §7.2. Computed from real rows only; the definitions
// (what counts as a scam attempt, dollars lost, decision time) live in shared/scoreboard.ts.
import { query } from "./_generated/server";
import { computeScoreboard } from "../shared/scoreboard";
import type { PolicyResult } from "../shared/types";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const [cases, payments, approvals] = await Promise.all([
      ctx.db.query("cases").collect(),
      ctx.db.query("payments").collect(),
      ctx.db.query("approvals").collect(),
    ]);
    return computeScoreboard({
      cases: cases.map((c) => ({
        id: c._id,
        status: c.status,
        decision: c.decision ?? null,
        flags: c.flags,
        firedRules: (c.policyResult as PolicyResult | undefined)?.firedRules ?? [],
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      payments: payments.map((p) => ({ caseId: p.caseId, amountCents: p.amountCents, status: p.status })),
      ownerInvolvedCaseIds: new Set(approvals.map((a) => a.caseId)),
      ownerApprovedCaseIds: new Set(approvals.filter((a) => a.approvedAt && !a.cancelledAt).map((a) => a.caseId)),
    });
  },
});
