// Turns one case's live Convex rows into what the room draws: a state per node, a chip under the
// nodes that have something to say, and which wires are carrying work. Pure: no React, no time of its own.
import { formatCents } from "../../shared/ledger";
import type { AgentName, CaseStatus, Decision, PolicyResult } from "../../shared/types";
import type { AgentId } from "../demo/film/story";
import type { CaseDetail } from "./AgentLanes";
import type { CaseRow } from "./DecisionCard";
import { secondsLeft } from "./format";
import type { NodeChip, NodeState } from "./AgentRoom";

type Run = CaseDetail["runs"][number];
type Callback = CaseDetail["callbacks"][number];
type Approval = CaseDetail["approvals"][number];
type Payment = CaseDetail["payments"][number];

export type RoomState = {
  states: Record<AgentId, NodeState>;
  chips: Partial<Record<AgentId, NodeChip>>;
  hotEdges: Set<string>;
};

const NODE_OF_AGENT: Record<AgentName, AgentId> = {
  intake: "intake",
  vendorVerifier: "verifier",
  riskAnalyst: "risk",
  callback: "callback",
  policy: "lock",
  ownerConcierge: "owner",
  payer: "payer",
};

/** The leader rests once the case waits on someone else or is closed. */
const LEADER_RESTING: ReadonlySet<CaseStatus> = new Set<CaseStatus>(["CLOSED", "CALLBACK_PENDING", "AWAITING_OWNER"]);
const RUN_STATE: Record<Run["status"], NodeState> = { queued: "idle", running: "busy", done: "done", failed: "failed" };
const PAYMENT_STATE: Record<Payment["status"], NodeState> = { sent: "paid", pending: "busy", failed: "failed" };

function newest<T>(rows: readonly T[], at: (row: T) => number): T | undefined {
  return [...rows].sort((a, b) => at(b) - at(a))[0];
}

export function deriveRoom(c: CaseRow, detail: CaseDetail | undefined, now: number): RoomState {
  const runs = detail?.runs ?? [];
  const payment = newest(detail?.payments ?? [], (p) => p.createdAt);
  const callback = newest(detail?.callbacks ?? [], (cb) => cb.startedAt);
  const approval = newest(detail?.approvals ?? [], (a) => a.requestedAt);

  const states: Record<AgentId, NodeState> = {
    leader: LEADER_RESTING.has(c.status) ? "done" : "busy",
    intake: "idle", verifier: "idle", risk: "idle", callback: "idle", owner: "idle", lock: "idle", payer: "idle",
  };
  for (const [agent, node] of Object.entries(NODE_OF_AGENT) as [AgentName, AgentId][]) {
    const run = newest(runs.filter((r) => r.agent === agent), (r) => r.startedAt);
    states[node] = run ? RUN_STATE[run.status] : "idle";
  }
  states.payer = payerState(c, payment, states.payer, runs.some((r) => r.agent === "payer"));

  // Keys match EDGES in story.ts: the leader reaches every agent but the payer; only the lock reaches the payer.
  const hotEdges = new Set<string>();
  for (const [node, state] of Object.entries(states)) {
    if (state === "busy" && node !== "leader" && node !== "payer") hotEdges.add(`leader-${node}`);
  }
  if (states.payer === "busy" || states.payer === "paid") hotEdges.add("lock-payer");

  const chips: Partial<Record<AgentId, NodeChip>> = { payer: payerChip(states.payer, payment) };
  if (callback) chips.callback = { text: callbackText(callback) };
  if (approval) chips.owner = { text: ownerText(approval, now) };
  return { states, chips, hotEdges };
}

function payerState(c: CaseRow, payment: Payment | undefined, runState: NodeState, hasRun: boolean): NodeState {
  if (payment) return PAYMENT_STATE[payment.status];
  if (hasRun) return runState;
  const decision: Decision | undefined = c.decision ?? (c.policyResult as PolicyResult | undefined)?.decision;
  const sealed = c.status === "CLOSED" && decision !== "PAY" && decision !== "NO_ACTION";
  return sealed ? "sealed" : "idle";
}

function payerChip(state: NodeState, payment: Payment | undefined): NodeChip {
  const amount = payment ? ` ${formatCents(payment.amountCents)}` : "";
  if (state === "paid") return { text: `Paid${amount}`, money: true };
  if (state === "busy") return { text: `Sending${amount}`, money: true };
  if (state === "failed") return { text: "Payment failed", money: true };
  if (state === "sealed") return { text: "$0 moved · sealed", money: true };
  return { text: "Never called", money: true };
}

function callbackText(cb: Callback): string {
  return cb.outcome ? `Vendor said: ${cb.outcome.replace("_", " ")}` : `Calling ${cb.numberDialed}`;
}

function ownerText(a: Approval, now: number): string {
  if (a.cancelledAt) return a.approvedAt ? "Cancelled in cooling-off" : "Declined";
  const coolingOff = a.approvedAt && a.coolingOffUntil && a.coolingOffUntil > now ? a.coolingOffUntil : null;
  if (coolingOff) return `Approved · cooling-off ${secondsLeft(coolingOff, now)}s`;
  return a.approvedAt ? "Approved" : "Waiting for the owner's code";
}
