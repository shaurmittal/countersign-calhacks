// Agent run tracking. Every agent calls start() and finish(); this is what animates the
// War Room lanes from real events. Never write a fake run.
import { v } from "convex/values";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { AgentName } from "../shared/types";
import { agentName } from "./schema";
import { appendAudit } from "./audit";

/** For use inside mutations. Actions use `internal.agentRuns.start`. */
export async function startRun(ctx: MutationCtx, args: { caseId: Id<"cases">; agent: AgentName; input?: unknown }) {
  const id = await ctx.db.insert("agentRuns", { ...args, status: "running", startedAt: Date.now() });
  await appendAudit(ctx, { caseId: args.caseId, actor: args.agent, action: "agent.start" });
  return id;
}

/** For use inside mutations. Actions use `internal.agentRuns.finish`. */
export async function finishRun(
  ctx: MutationCtx,
  runId: Id<"agentRuns">,
  result: { output?: unknown; summary?: string; error?: string },
) {
  const run = await ctx.db.get(runId);
  if (!run) throw new Error(`agentRun ${runId} not found`);
  const { output, summary, error } = result;
  await ctx.db.patch(runId, { status: error ? "failed" : "done", output, summary, error, endedAt: Date.now() });
  await appendAudit(ctx, {
    caseId: run.caseId,
    actor: run.agent,
    action: error ? "agent.failed" : "agent.done",
    payload: { summary, error },
  });
}

export const start = internalMutation({
  args: { caseId: v.id("cases"), agent: agentName, input: v.optional(v.any()) },
  handler: (ctx, args) => startRun(ctx, args),
});

export const finish = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    output: v.optional(v.any()),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: (ctx, { runId, ...result }) => finishRun(ctx, runId, result),
});

export const forCase = query({
  args: { caseId: v.id("cases") },
  handler: (ctx, { caseId }) =>
    ctx.db.query("agentRuns").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect(),
});
