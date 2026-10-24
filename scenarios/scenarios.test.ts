// Runs every scenario in scenarios.json through the real Policy Engine against the seed world.
// Prints the line for the pitch: "30 scenarios · 20/20 scams blocked · ... · 0 false PAY".
import { describe, expect, it } from "vitest";
import { prescan } from "../shared/intake/prescan";
import type { PolicyResult } from "../shared/types";
import { SCENARIOS, runScenario, summaryLine, type Scenario } from "./run";

const results: { s: Scenario; r: PolicyResult }[] = [];

describe("scenario answer key", () => {
  it("has 20 scams and 10 legitimate requests", () => {
    expect(SCENARIOS.filter((s) => s.scam)).toHaveLength(20);
    expect(SCENARIOS.filter((s) => !s.scam)).toHaveLength(10);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  for (const s of SCENARIOS) {
    it(`${s.scam ? "scam" : "legit"}: ${s.id} -> ${s.expectedDecision}`, () => {
      const r = runScenario(s);
      results.push({ s, r });
      expect(r.decision, r.reasons.join("\n")).toBe(s.expectedDecision);
      expect(r.firedRules).toEqual(expect.arrayContaining(s.expectedRules));
      if (s.expectOverridable !== undefined) expect(r.overridable).toBe(s.expectOverridable);
      if (s.scam) expect(r.decision).not.toBe("PAY");
    });
  }

  it("summary line for the pitch", () => {
    expect(results).toHaveLength(SCENARIOS.length);
    expect(summaryLine(results)).toBe(
      "30 scenarios · 20/20 scams blocked · 10/10 legitimate paid or correctly escalated · 0 false PAY",
    );
  });

  it("the regex prescan catches every planted injection and forbidden rail on its own", () => {
    for (const s of SCENARIOS) {
      const scan = prescan(s.text);
      if (s.request.injectionAttempt) expect(scan.injection, s.id).toBe(true);
      if (s.request.requestedAction === "gift_cards" || s.request.requestedAction === "crypto") {
        expect(scan.forbiddenRail, s.id).toBe(s.request.requestedAction);
      }
      if (!s.request.injectionAttempt) expect(scan.injection, s.id).toBe(false);
    }
  });
});
