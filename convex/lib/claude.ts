// Claude calls for the Intake Parser and the leader's reply. No Convex imports, so the eval
// script (scripts/eval-intake.ts) runs the exact same code. Claude reads and writes words here;
// nothing in this file can move money.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Channel, PaymentRequest, PolicyResult } from "../../shared/types";
import { prescan } from "../../shared/intake/prescan";
import { IntakeOutput, fallbackRequest, merge } from "../../shared/intake/schema";
import {
  type BusinessContext,
  intakeSystemPrompt,
  replySystemPrompt,
  replyUserPrompt,
  wrapUntrusted,
} from "../../shared/intake/prompt";
import { isSafeReply, templateReply, type ReplyContext } from "../../shared/reply";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
// Latency budget: SMS -> decision under 10 s. Low effort is plenty for extraction.
const EFFORT = (process.env.CLAUDE_EFFORT ?? "low") as "low" | "medium" | "high";
// Per-call budgets. Enforced with a race, NOT the SDK's `timeout`: in Convex's runtime the SDK's
// abort-on-timeout can throw from inside a timer ("The stream is not in a state that permits close"),
// which nothing can catch and which kills the whole pipeline run. The SDK timeout is only a backstop.
const INTAKE_BUDGET_MS = 12_000;
const REPLY_BUDGET_MS = 8_000;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({ timeout: 120_000, maxRetries: 1 });
  return client;
}

const TIMED_OUT = Symbol("timed out");

/** Resolves to TIMED_OUT after `ms`. The losing request keeps running and is ignored, never aborted. */
async function withinBudget<T>(call: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  call.catch(() => {}); // a late failure of an abandoned call must not surface as unhandled
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([call, expired]);
  } finally {
    clearTimeout(timer);
  }
}

export type IntakeResult = { request: PaymentRequest; attempts: number; error?: string };

/** Raw text -> PaymentRequest. Retries once; on a second failure returns a parseFailed request (HOLD). */
export async function extractPaymentRequest(
  channel: Channel,
  rawContent: string,
  biz: BusinessContext,
): Promise<IntakeResult> {
  const scan = prescan(rawContent);
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await withinBudget(anthropic().beta.messages.parse({
        model: MODEL,
        max_tokens: 2000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: EFFORT, format: betaZodOutputFormat(IntakeOutput) },
        system: intakeSystemPrompt(biz),
        messages: [{ role: "user", content: wrapUntrusted(channel, rawContent) }],
      }), INTAKE_BUDGET_MS);
      if (response === TIMED_OUT) {
        lastError = `timed out after ${INTAKE_BUDGET_MS}ms`;
        continue;
      }
      if (response.stop_reason === "refusal") {
        lastError = `refusal: ${response.stop_details?.category ?? "unknown"}`;
        break; // a refusal won't change on retry
      }
      if (!response.parsed_output) {
        lastError = `no parsed output (stop_reason ${response.stop_reason})`;
        continue;
      }
      return { request: merge(response.parsed_output, scan), attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { request: fallbackRequest(scan), attempts: 2, error: lastError };
}

/** Writes the requester-facing reply. Falls back to a template if Claude fails or over-promises. */
export async function composeReply(args: {
  channel: Channel;
  rawContent: string;
  result: PolicyResult;
  biz: BusinessContext;
  ctx: ReplyContext;
}): Promise<{ text: string; source: "claude" | "template" }> {
  const fallback = { text: templateReply(args.result, args.ctx), source: "template" as const };
  // Fixed text where there is nothing to explain, and for the callback line the demo relies on.
  if (args.result.decision === "NO_ACTION" || args.result.decision === "PAY" || args.ctx.callbackInProgress) return fallback;
  try {
    const response = await withinBudget(anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 1000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: replySystemPrompt(args.biz),
      messages: [
        {
          role: "user",
          content: replyUserPrompt({
            channel: args.channel,
            rawContent: args.rawContent,
            result: args.result,
            vendorName: args.ctx.vendorName,
            paymentSent: args.ctx.paymentSent,
            callbackInProgress: args.ctx.callbackInProgress,
          }),
        },
      ],
    }), REPLY_BUDGET_MS);
    if (response === TIMED_OUT || response.stop_reason !== "end_turn") return fallback;
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    return isSafeReply(text, args.result, args.ctx.paymentSent) ? { text, source: "claude" } : fallback;
  } catch {
    return fallback;
  }
}
