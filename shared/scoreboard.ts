// War Room top-bar numbers (owner: P4). Spec §7.2 and §9. Pure, so the definitions are tested
// and a judge can ask "what counts as a scam attempt?" and get a precise answer.
import type { CaseStatus, Decision } from "./types";

/** Rules that only fire on social engineering: sanctions, gift cards/crypto, callback denied, owner claim, injection. */
export const SCAM_RULES: ReadonlySet<string> = new Set(["R8", "R9", "R10", "R11", "R15"]);
export const SCAM_FLAGS: ReadonlySet<string> = new Set([
  "owner_impersonation",
  "injection_attempt",
  "forbidden_rail",
  "lookalike_domain",
]);

export type ScoreCase = {
  id: string;
  status: CaseStatus;
  decision: Decision | null;
  flags: string[];
  firedRules: string[];
  createdAt: number;
  updatedAt: number;
};

export type ScorePayment = { caseId: string; amountCents: number; status: "pending" | "sent" | "failed" };

export type Scoreboard = {
  /** Every case on every channel, including judges' live attempts. */
  requests: number;
  scamAttempts: number;
  /** Money sent on a scam-flagged case without the owner's step-up approval. Should stay $0. */
  dollarsLostCents: number;
  realBillsPaid: number;
  dollarsPaidCents: number;
  /** Machine decision time on closed cases; cases that waited for the owner are excluded. */
  medianDecisionMs: number | null;
};

function hasScamSignal(c: ScoreCase): boolean {
  return c.firedRules.some((r) => SCAM_RULES.has(r)) || c.flags.some((f) => SCAM_FLAGS.has(f));
}

/** A request Countersign refused (BLOCK) or that carried a scam signal and was not paid. */
export function isScamAttempt(c: ScoreCase): boolean {
  if (c.decision === "PAY") return false;
  return c.decision === "BLOCK" || hasScamSignal(c);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function computeScoreboard(input: {
  cases: ScoreCase[];
  payments: ScorePayment[];
  /** Cases with an owner approval row: their duration includes human time. */
  ownerInvolvedCaseIds: ReadonlySet<string>;
  /** Cases the owner approved via step-up: a scam signal there is the owner's informed call. */
  ownerApprovedCaseIds: ReadonlySet<string>;
}): Scoreboard {
  const byId = new Map(input.cases.map((c) => [c.id, c]));
  const sent = input.payments.filter((p) => p.status === "sent");

  const lost = sent.filter((p) => {
    const c = byId.get(p.caseId);
    return !!c && hasScamSignal(c) && !input.ownerApprovedCaseIds.has(c.id);
  });

  const decisionTimes = input.cases
    .filter((c) => c.status === "CLOSED" && c.decision && c.decision !== "NO_ACTION")
    .filter((c) => !input.ownerInvolvedCaseIds.has(c.id))
    .map((c) => c.updatedAt - c.createdAt);

  return {
    requests: input.cases.length,
    scamAttempts: input.cases.filter(isScamAttempt).length,
    dollarsLostCents: lost.reduce((sum, p) => sum + p.amountCents, 0),
    realBillsPaid: sent.length,
    dollarsPaidCents: sent.reduce((sum, p) => sum + p.amountCents, 0),
    medianDecisionMs: median(decisionTimes),
  };
}
