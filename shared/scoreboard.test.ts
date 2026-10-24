import { describe, expect, it } from "vitest";
import { computeScoreboard, isScamAttempt, type ScoreCase, type ScorePayment } from "./scoreboard";

function aCase(overrides: Partial<ScoreCase> = {}): ScoreCase {
  return {
    id: "c1",
    status: "CLOSED",
    decision: "PAY",
    flags: [],
    firedRules: ["R12"],
    createdAt: 0,
    updatedAt: 10_000,
    ...overrides,
  };
}

const none: ReadonlySet<string> = new Set();

function score(cases: ScoreCase[], payments: ScorePayment[] = [], involved = none, approved = none) {
  return computeScoreboard({ cases, payments, ownerInvolvedCaseIds: involved, ownerApprovedCaseIds: approved });
}

describe("isScamAttempt", () => {
  it("counts every BLOCK", () => {
    expect(isScamAttempt(aCase({ decision: "BLOCK", firedRules: ["R1"] }))).toBe(true);
  });

  it("counts an unpaid case with a scam rule or flag", () => {
    expect(isScamAttempt(aCase({ decision: "ESCALATE", firedRules: ["R11"] }))).toBe(true);
    expect(isScamAttempt(aCase({ decision: "HOLD", firedRules: [], flags: ["injection_attempt"] }))).toBe(true);
  });

  it("does not count a held legitimate request or a paid bill", () => {
    expect(isScamAttempt(aCase({ decision: "HOLD", firedRules: ["R5"] }))).toBe(false);
    expect(isScamAttempt(aCase({ decision: "PAY", firedRules: ["R11", "R12"] }))).toBe(false);
  });
});

describe("computeScoreboard", () => {
  it("counts paid bills and dollars from sent payments only", () => {
    const board = score(
      [aCase({ id: "a" }), aCase({ id: "b" })],
      [
        { caseId: "a", amountCents: 362_00, status: "sent" },
        { caseId: "b", amountCents: 1_200_00, status: "failed" },
      ],
    );
    expect(board.realBillsPaid).toBe(1);
    expect(board.dollarsPaidCents).toBe(362_00);
  });

  it("reports dollars lost when a scam-flagged case was paid without the owner", () => {
    const flagged = aCase({ id: "x", firedRules: ["R10", "R12"] });
    const payment: ScorePayment = { caseId: "x", amountCents: 4_800_00, status: "sent" };
    expect(score([flagged], [payment]).dollarsLostCents).toBe(4_800_00);
    expect(score([flagged], [payment], new Set(["x"]), new Set(["x"])).dollarsLostCents).toBe(0);
  });

  it("is $0 lost when nothing scam-flagged was paid", () => {
    const board = score([aCase({ id: "s", decision: "BLOCK", firedRules: ["R9"] })]);
    expect(board.scamAttempts).toBe(1);
    expect(board.dollarsLostCents).toBe(0);
  });

  it("takes the median machine decision time, skipping owner waits, NO_ACTION and open cases", () => {
    const board = score(
      [
        aCase({ id: "1", updatedAt: 4_000 }),
        aCase({ id: "2", updatedAt: 8_000 }),
        aCase({ id: "3", updatedAt: 30_000 }),
        aCase({ id: "owner", updatedAt: 600_000 }),
        aCase({ id: "hi", decision: "NO_ACTION", updatedAt: 1_000 }),
        aCase({ id: "open", status: "VERIFYING", decision: null, updatedAt: 99_000 }),
      ],
      [],
      new Set(["owner"]),
    );
    expect(board.medianDecisionMs).toBe(8_000);
    expect(board.requests).toBe(6);
  });

  it("averages the two middle values for an even count and is null with no closed cases", () => {
    expect(score([aCase({ id: "1", updatedAt: 2_000 }), aCase({ id: "2", updatedAt: 4_000 })]).medianDecisionMs).toBe(3_000);
    expect(score([]).medianDecisionMs).toBeNull();
  });
});
