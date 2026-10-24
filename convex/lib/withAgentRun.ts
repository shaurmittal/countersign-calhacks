import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { AgentName } from "../../shared/types";

/**
 * Wraps one agent step so it writes an agentRuns row on start and finish (War Room lanes)
 * and an audit event for each. `summarize` turns the output into the one-line lane text.
 */
export async function withAgentRun<T>(
  ctx: ActionCtx,
  caseId: Id<"cases">,
  agent: AgentName,
  fn: () => Promise<T>,
  summarize?: (out: T) => string,
): Promise<T> {
  const runId = await ctx.runMutation(internal.agentRuns.start, { caseId, agent });
  try {
    const output = await fn();
    await ctx.runMutation(internal.agentRuns.finish, {
      runId,
      output: output as unknown,
      summary: summarize?.(output),
    });
    return output;
  } catch (err) {
    await ctx.runMutation(internal.agentRuns.finish, { runId, error: String(err) });
    throw err;
  }
}
