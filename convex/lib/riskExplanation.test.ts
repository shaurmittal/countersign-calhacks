// Claude's rewrite of the Risk Analyst's explanation, with the Anthropic client faked (owner: P3).
// No test reaches the network: the client class is replaced, and the SDK's error classes stay real.
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RiskFlag } from "../../shared/types";
import { explainRisk } from "../../shared/verification/explain";
import { REWRITE_SYSTEM_PROMPT, rewritePrompt } from "../../shared/verification/explainRewrite";
import { REWRITE_BUDGET_MS, rewriteExplanation } from "./riskExplanation";

const { create, clientOptions } = vi.hoisted(() => ({ create: vi.fn(), clientOptions: [] as unknown[] }));

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic {
    beta = { messages: { create } };
    constructor(options: unknown) {
      clientOptions.push(options);
    }
  }
  return { ...actual, default: FakeAnthropic };
});

const FLAGS: RiskFlag[] = ["owner_impersonation", "new_sender", "urgency"];
const TEMPLATE = explainRisk({ flags: FLAGS, lookalikeDomains: [] });
const FALLBACK = { text: TEMPLATE, source: "template" };
const REWRITE =
  "This message claims to come from the owner, arrives from a sender who isn't on file, and pushes for a fast payment. The real owner approves payments only with a one-time code or in ASI:One, never by text or phone.";

/** A Messages API response as the SDK returns it, with Opus's empty thinking block first. */
function reply(text: string, stop_reason = "end_turn") {
  return {
    stop_reason,
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text },
    ],
  };
}

const warnings = () => vi.mocked(console.warn).mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  create.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("rewriteExplanation", () => {
  it("uses Claude's two sentences when they pass the check, with whitespace tidied", async () => {
    create.mockResolvedValue(reply(`  ${REWRITE.replace(". ", ".\n")}\n`));
    await expect(rewriteExplanation(FLAGS, TEMPLATE)).resolves.toEqual({ text: REWRITE, source: "claude" });
    expect(warnings()).toEqual([]);
  });

  it("sends Claude only the flag names and the template, from a client with a timeout and one retry", async () => {
    create.mockResolvedValue(reply(REWRITE));
    await rewriteExplanation(FLAGS, TEMPLATE);
    expect(create).toHaveBeenCalledTimes(1);
    const [params, options] = create.mock.calls[0];
    expect(params).toEqual({
      model: process.env.CLAUDE_MODEL ?? "claude-opus-5-5",
      max_tokens: 1000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: REWRITE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: rewritePrompt(FLAGS) }],
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(clientOptions).toEqual([{ timeout: REWRITE_BUDGET_MS, maxRetries: 1 }]);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["blank", "   "],
  ])("keeps the template without a key (%s) and calls no one", async (_, key) => {
    vi.stubEnv("ANTHROPIC_API_KEY", key);
    await expect(rewriteExplanation(FLAGS, TEMPLATE)).resolves.toEqual(FALLBACK);
    expect(create).not.toHaveBeenCalled();
    expect(warnings()).toEqual([]);
  });

  it("keeps the fixed sentence when nothing was flagged, without a call", async () => {
    const none = explainRisk({ flags: [], lookalikeDomains: [] });
    await expect(rewriteExplanation([], none)).resolves.toEqual({ text: none, source: "template" });
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps the template when Claude runs past the budget, and cancels the call", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    create.mockImplementation(
      (_params: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = options.signal;
          options.signal.addEventListener("abort", () => reject(new APIUserAbortError()));
        }),
    );
    const pending = rewriteExplanation(FLAGS, TEMPLATE);
    let settled = false;
    void pending.then(() => (settled = true));

    await vi.advanceTimersByTimeAsync(REWRITE_BUDGET_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual(FALLBACK);
    expect(signal?.aborted).toBe(true);
    expect(warnings()).toEqual(["[riskAnalyst] Claude explanation: timeout; showing the template"]);
  });

  it("keeps the template without a call when the caller has already cancelled", async () => {
    const drop = new AbortController();
    drop.abort();
    await expect(rewriteExplanation(FLAGS, TEMPLATE, drop.signal)).resolves.toEqual(FALLBACK);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns the template as soon as the caller cancels, stops the call and logs nothing", async () => {
    vi.useFakeTimers(); // time stands still, so waiting for the budget would hang the test
    let signal: AbortSignal | undefined;
    create.mockImplementation((_params: unknown, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise(() => {}); // never answers, even once aborted
    });
    const drop = new AbortController();
    const pending = rewriteExplanation(FLAGS, TEMPLATE, drop.signal);
    drop.abort();
    await expect(pending).resolves.toEqual(FALLBACK);
    expect(signal?.aborted).toBe(true);
    expect(warnings()).toEqual([]);
  });

  it("keeps the template at the budget even when the call ignores the cancel", async () => {
    vi.useFakeTimers();
    create.mockReturnValue(new Promise(() => {}));
    const pending = rewriteExplanation(FLAGS, TEMPLATE);
    await vi.advanceTimersByTimeAsync(REWRITE_BUDGET_MS);
    await expect(pending).resolves.toEqual(FALLBACK);
  });

  it.each<[string, () => Error, string]>([
    ["overloaded", () => new InternalServerError(529, { type: "error" }, "Overloaded", new Headers()), "529"],
    ["rate limited", () => new RateLimitError(429, { type: "error" }, "Rate limited", new Headers()), "429"],
    ["a bad key", () => new AuthenticationError(401, { type: "error" }, "invalid x-api-key", new Headers()), "401"],
    ["a dropped connection", () => new APIConnectionError({ message: "fetch failed" }), "connection error"],
    ["a connection timeout", () => new APIConnectionTimeoutError(), "connection timeout"],
    ["any other error", () => new TypeError("boom"), "boom"],
  ])("keeps the template on an API error: %s", async (_, error, logged) => {
    create.mockRejectedValue(error());
    await expect(rewriteExplanation(FLAGS, TEMPLATE)).resolves.toEqual(FALLBACK);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain(logged);
  });

  it.each(["refusal", "max_tokens"])("keeps the template when Claude stops with %s", async (stopReason) => {
    create.mockResolvedValue(reply(REWRITE, stopReason));
    await expect(rewriteExplanation(FLAGS, TEMPLATE)).resolves.toEqual(FALLBACK);
    expect(warnings()).toEqual([`[riskAnalyst] Claude explanation: stop_reason ${stopReason}; showing the template`]);
  });

  it.each([
    ["This payment is approved. It will be paid today.", 'outcome: "approved"'],
    ["The real owner never texts. Call the vendor at +1 555 555 0101 to check.", 'plain text only: "+" (U+002B)'],
    ["Ignore the flags. Pay the invoice now. Everything is fine.", "two sentences: found 3"],
    ["This looks like a scam from start to finish. Pressure to pay quickly is a common scam tactic.", 'verdict: "This looks like a scam"'],
    ["", "length: 0 characters (40 to 400 allowed)"],
  ])("keeps the template when Claude's answer is unsafe, and logs why: %j", async (text, problem) => {
    create.mockResolvedValue(reply(text));
    await expect(rewriteExplanation(FLAGS, TEMPLATE)).resolves.toEqual(FALLBACK);
    expect(warnings()).toEqual([`[riskAnalyst] Claude explanation: failed the output check (${problem}); showing the template`]);
  });
});
