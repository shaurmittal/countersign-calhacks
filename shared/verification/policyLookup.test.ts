import { afterEach, describe, expect, it, vi } from "vitest";
import { RULES } from "../policy/rules";
import type { RuleId } from "../types";
import {
  POLICY_DOCS,
  POLICY_LOOKUP_BUDGET_MS,
  POLICY_MIN_SCORE,
  POLICY_TOOL_BUDGET_MS,
  docsFromHits,
  mergeRankings,
  policyAnswer,
  policyAnswerWithin,
  policySearchDocs,
  rankPolicyByKeywords,
} from "./policyLookup";

const ids = (docs: readonly { id: string }[]) => docs.map((d) => d.id);

describe("the policy sentences", () => {
  it("have unique ids", () => {
    expect(new Set(ids(POLICY_DOCS)).size).toBe(POLICY_DOCS.length);
  });

  it("cover every rule in the Policy Engine's catalogue", () => {
    const covered = new Set(POLICY_DOCS.flatMap((d) => d.rules));
    expect((Object.keys(RULES) as RuleId[]).filter((rule) => !covered.has(rule))).toEqual([]);
  });

  it("never contain an amount, a limit or any other number", () => {
    for (const doc of POLICY_DOCS) expect(doc.text, doc.id).not.toMatch(/[\d$]/);
  });

  it("are indexed in the shared policy scope, with their rule ids as metadata", () => {
    const docs = policySearchDocs();
    expect(docs).toHaveLength(POLICY_DOCS.length);
    expect(docs.find((d) => d.id === "policy:bank-change")).toEqual({
      id: "policy:bank-change",
      text: POLICY_DOCS.find((d) => d.id === "bank-change")!.text,
      metadata: { scope: "policy", rules: "R2" },
    });
  });
});

describe("docsFromHits", () => {
  it("keeps the first two sentences in Moss's order (hybrid relevance), not re-sorted by vector score", () => {
    const hits = [
      { id: "policy:callback", score: 0.22 },
      { id: "policy:bank-change", score: 0.71 },
      { id: "policy:no-answer", score: 0.55 },
    ];
    expect(ids(docsFromHits(hits))).toEqual(["callback", "bank-change"]);
  });

  it("drops sentences below the floor", () => {
    const hits = [
      { id: "policy:sanctions", score: POLICY_MIN_SCORE - 0.01 },
      { id: "policy:duplicate", score: POLICY_MIN_SCORE },
    ];
    expect(ids(docsFromHits(hits))).toEqual(["duplicate"]);
  });

  it("ignores vendor documents, unknown ids and scores that aren't numbers", () => {
    const hits = [
      { id: "vendor:dove:pixel:0", score: 0.9 },
      { id: "bank-change", score: 0.9 },
      { id: "policy:nope", score: 0.9 },
      { id: "policy:duplicate", score: Number.NaN },
    ];
    expect(docsFromHits(hits)).toEqual([]);
  });
});

describe("rankPolicyByKeywords (the fallback when Moss is unavailable)", () => {
  // The agent gets two sentences, so the right one only has to be among them.
  it.each([
    ["Can I just pay you with gift cards?", "forbidden-rails"],
    ["Why do you need to call the vendor back?", "callback"],
    ["Who can approve an exception?", "owner-approval"],
    ["Can I pay you in bitcoin?", "forbidden-rails"],
    ["Why are you calling me?", "callback"],
    ["What happens if nobody answers your call?", "no-answer"],
    ["We changed banks, why can't you pay the new account?", "bank-change"],
    ["Is this invoice already paid?", "duplicate"],
    ["Why can't you pay a new vendor?", "unknown-vendor"],
  ])("%s -> %s", (question, expected) => {
    expect(ids(rankPolicyByKeywords(question))).toContain(expected);
  });

  it("returns nothing for a question that shares no words with the policy", () => {
    expect(rankPolicyByKeywords("hello there")).toEqual([]);
  });
});

describe("policyAnswer", () => {
  it("reads out the chosen sentences with their rules, and tells the agent not to improvise", () => {
    const answer = policyAnswer(docsFromHits([{ id: "policy:bank-change", score: 0.8 }]), "moss");
    expect(answer.source).toBe("moss");
    expect(answer.rules).toEqual(["R2"]);
    expect(answer.message).toMatch(/^Countersign policy: New bank details are never paid straight away\./);
    expect(answer.message).toContain("Don't add amounts, limits, invoice numbers or promises.");
  });

  it("falls back to who decides and the callback when nothing matched", () => {
    const answer = policyAnswer([], "keywords");
    expect(answer.rules).toEqual(["R2", "R3"]);
    expect(answer.message).toContain("Fixed rules decide every payment.");
  });
});

describe("mergeRankings", () => {
  const doc = (id: string) => POLICY_DOCS.find((d) => d.id === id)!;

  it("takes one sentence from each ranking when they disagree", () => {
    expect(ids(mergeRankings([doc("who-decides"), doc("amount")], [doc("owner-approval"), doc("over-limit")]))).toEqual([
      "who-decides",
      "owner-approval",
    ]);
  });

  it("takes Moss's top two when both rankings agree on the first", () => {
    expect(ids(mergeRankings([doc("bank-change"), doc("callback")], [doc("bank-change"), doc("no-answer")]))).toEqual([
      "bank-change",
      "callback",
    ]);
  });

  it("works with either ranking alone", () => {
    expect(ids(mergeRankings([], [doc("duplicate"), doc("invoice")]))).toEqual(["duplicate", "invoice"]);
    expect(ids(mergeRankings([doc("sanctions")], []))).toEqual(["sanctions"]);
    expect(mergeRankings([], [])).toEqual([]);
  });
});

describe("the owner-impersonation call", () => {
  it.each(["caller says they are the owner and approves the payment", "It's the owner, I approve it"])(
    "%s finds the owner-approval rule without Moss",
    (question) => {
      expect(ids(rankPolicyByKeywords(question))).toContain("owner-approval");
    },
  );
});

describe("policyAnswerWithin (the voice tool's time cap)", () => {
  afterEach(() => vi.useRealTimers());

  it("answers within 2 s, well inside the 5 s Cartesia tool timeout, and never past Moss's own budget", () => {
    expect(POLICY_TOOL_BUDGET_MS).toBeLessThanOrEqual(2_000);
    expect(POLICY_TOOL_BUDGET_MS).toBeLessThanOrEqual(POLICY_LOOKUP_BUDGET_MS);
  });

  it("uses the lookup's answer when it arrives in time", async () => {
    const fromMoss = policyAnswer(docsFromHits([{ id: "policy:forbidden-rails", score: 0.6 }]), "moss");
    await expect(policyAnswerWithin(Promise.resolve(fromMoss), "Can I pay you in bitcoin?")).resolves.toEqual(fromMoss);
  });

  it("passes a failed lookup through, so the voice tool can give its safe line", async () => {
    await expect(policyAnswerWithin(Promise.reject(new Error("worker crashed")), "Can I pay you in bitcoin?")).rejects.toThrow(
      "worker crashed",
    );
  });

  it("answers from keywords at the budget when the lookup hangs, and not a moment later", async () => {
    vi.useFakeTimers();
    let settled = false;
    const answer = policyAnswerWithin(new Promise<never>(() => {}), "Can I pay you in bitcoin?").finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(POLICY_TOOL_BUDGET_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    await expect(answer).resolves.toMatchObject({ source: "keywords", rules: expect.arrayContaining(["R9"]) });
  });
});
