import { describe, expect, it } from "vitest";
import { RULES } from "../policy/rules";
import type { RuleId } from "../types";
import {
  POLICY_DOCS,
  POLICY_INDEX_PREFIX,
  POLICY_MIN_SCORE,
  docsFromHits,
  policyAnswer,
  policyIndexName,
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

  it("are indexed with their rule ids as metadata", () => {
    const docs = policySearchDocs();
    expect(docs).toHaveLength(POLICY_DOCS.length);
    expect(docs.find((d) => d.id === "bank-change")).toEqual({
      id: "bank-change",
      text: POLICY_DOCS.find((d) => d.id === "bank-change")!.text,
      metadata: { rules: "R2" },
    });
  });
});

describe("policyIndexName", () => {
  it("is per deployment", () => {
    expect(policyIndexName("https://handsome-dove-614.convex.cloud")).toBe(`${POLICY_INDEX_PREFIX}-handsome-dove-614`);
    expect(policyIndexName(undefined)).toBe(POLICY_INDEX_PREFIX);
  });
});

describe("docsFromHits", () => {
  it("keeps the two best known sentences at or above the floor", () => {
    const hits = [
      { id: "callback", score: 0.62 },
      { id: "bank-change", score: 0.71 },
      { id: "no-answer", score: 0.55 },
      { id: "sanctions", score: POLICY_MIN_SCORE - 0.01 },
    ];
    expect(ids(docsFromHits(hits))).toEqual(["bank-change", "callback"]);
  });

  it("ignores ids that aren't policy sentences and scores that aren't numbers", () => {
    expect(docsFromHits([{ id: "pixel#0", score: 0.9 }, { id: "duplicate", score: Number.NaN }])).toEqual([]);
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
    const answer = policyAnswer(docsFromHits([{ id: "bank-change", score: 0.8 }]), "moss");
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
