// War Room data for one case (owner: P4). Spec §7.2. One subscription per selected case:
// agent runs (the lanes), callbacks, approvals, payments with their journal lines.
// Only real rows: nothing here is synthesized for show.
import { v } from "convex/values";
import { query } from "./_generated/server";
import { maskTail, publicApproval, summarizeCase } from "./lib/caseView";
import { paymentJournal } from "../shared/ledger";

export const caseDetail = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.db.get(caseId);
    if (!c) return null;
    const [runs, callbacks, approvals, payments] = await Promise.all([
      ctx.db.query("agentRuns").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect(),
      ctx.db.query("callbacks").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect(),
      ctx.db.query("approvals").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect(),
      ctx.db.query("payments").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect(),
    ]);
    const summary = await summarizeCase(ctx, c);

    return {
      summary,
      runs: runs.map(({ input, ...run }) => {
        void input;
        return run;
      }),
      callbacks: callbacks.map((cb) => ({ ...cb, numberDialed: maskTail(cb.numberDialed) })),
      approvals: approvals.map(publicApproval),
      payments: payments.map((p) => ({
        ...p,
        journal: paymentJournal({ amountCents: p.amountCents, vendorName: summary.vendorName ?? "vendor", rail: p.rail }),
      })),
    };
  },
});
