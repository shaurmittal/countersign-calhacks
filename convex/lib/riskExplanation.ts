// Claude's rewrite of the Risk Analyst's explanation (owner: P3). Spec §6.3. Built like convex/lib/claude.ts.
// Display only: it returns words for the War Room and never touches the flags or the score, so nothing here
// can decide or move money. Claude reads the flag names and a template built from them
// (shared/verification/explainRewrite.ts), never the message, the sender or the vendor book.
// The template from explainRisk stands without ANTHROPIC_API_KEY, without flags, on any error, after the
// time budget, and whenever the answer fails the output check.
// The budget is enforced with a race, NOT the SDK's `timeout` or an abort (as in convex/lib/claude.ts): in
// Convex's runtime the SDK's abort can throw from inside a timer ("The stream is not in a state that permits
// close"), which nothing can catch and which kills the whole pipeline run. A call that loses the race keeps
// running and is ignored, never aborted.
import Anthropic, { APIConnectionError, APIConnectionTimeoutError, APIError } from "@anthropic-ai/sdk";
import type { RiskFlag } from "../../shared/types";
import { REWRITE_SYSTEM_PROMPT, checkRewrite, rewritePrompt } from "../../shared/verification/explainRewrite";
import { withTimeout } from "../../shared/verification/moss";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
// Latency budget: SMS -> decision under 10 s, and the Risk Analyst runs beside the Vendor Verifier.
// The budget covers the whole call, the retry included; then the template stands.
export const REWRITE_BUDGET_MS = 4_000;
/** Only a backstop, far past any pipeline run, so the SDK's own abort never fires while one is going. */
export const SDK_BACKSTOP_TIMEOUT_MS = 120_000;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({ timeout: SDK_BACKSTOP_TIMEOUT_MS, maxRetries: 1 });
  return client;
}

export type Explanation = { text: string; source: "claude" | "template" };
type Answer = { text: string } | { failed: string };

/** A short reason for the log. API errors keep the API's own words: the request held only flags and the template. */
function failure(err: unknown): string {
  if (err instanceof APIConnectionTimeoutError) return "connection timeout";
  if (err instanceof APIConnectionError) return "connection error";
  if (err instanceof APIError) return err.message.slice(0, 200);
  return err instanceof Error ? err.message.slice(0, 200) : "unknown error";
}

/** Claude's raw answer, or why there is none. Never throws. No abort signal: the request is never cancelled. */
async function ask(prompt: string): Promise<Answer> {
  try {
    const response = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 1000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: REWRITE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason !== "end_turn") return { failed: `stop_reason ${response.stop_reason}` };
    return { text: response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("") };
  } catch (err) {
    return { failed: failure(err) };
  }
}

/**
 * Claude's two sentences for the flags, or the template. Never throws, and never takes longer than the budget.
 * Aborting `cancel` returns the template at once, with no warning: the caller no longer wants the words.
 * Neither the budget nor `cancel` aborts the request itself; a late answer is simply dropped.
 */
export async function rewriteExplanation(
  flags: readonly RiskFlag[],
  template: string,
  cancel?: AbortSignal,
): Promise<Explanation> {
  const fallback: Explanation = { text: template, source: "template" };
  const prompt = rewritePrompt(flags);
  if (prompt === null || !process.env.ANTHROPIC_API_KEY?.trim() || cancel?.aborted) return fallback;
  const dropped = new Promise<Answer>((resolve) =>
    cancel?.addEventListener("abort", () => resolve({ failed: "cancelled" }), { once: true }),
  );
  const answer = await withTimeout(Promise.race([ask(prompt), dropped]), REWRITE_BUDGET_MS, { failed: "timeout" });
  if (cancel?.aborted) return fallback;
  if ("failed" in answer) {
    console.warn(`[riskAnalyst] Claude explanation: ${answer.failed}; showing the template`);
    return fallback;
  }
  const checked = checkRewrite(answer.text);
  if ("text" in checked) return { text: checked.text, source: "claude" };
  console.warn(`[riskAnalyst] Claude explanation: failed the output check (${checked.problem}); showing the template`);
  return fallback;
}
