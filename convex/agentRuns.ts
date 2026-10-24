// Agent run tracking. Every agent calls start() and finish(); this is what animates the
// War Room lanes from real events. Never write a fake run.
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { agentName } from "./schema";
import { appendAudit } from "./audit";

export const start = internalMutation({
  args: { caseId: v.id("cases"), agent: agentName, input: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("agentRuns", { ...args, status: "running", startedAt: Date.now() });
    await appendAudit(ctx, { caseId: args.caseId, actor: args.agent, action: "agent.start" });
    return id;
  },
});

export const finish = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    output: v.optional(v.any()),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { runId, output, summary, error }) => {
    const run = await ctx.db.get(runId);
    if (!run) throw new Error(`agentRun ${runId} not found`);
    await ctx.db.patch(runId, { status: error ? "failed" : "done", output, summary, error, endedAt: Date.now() });
    await appendAudit(ctx, {
      caseId: run.caseId,
      actor: run.agent,
      action: error ? "agent.failed" : "agent.done",
      payload: { summary, error },
    });
  },
});

export const forCase = query({
  args: { caseId: v.id("cases") },
  handler: (ctx, { caseId }) =>
    ctx.db.query("agentRuns").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect(),
});
