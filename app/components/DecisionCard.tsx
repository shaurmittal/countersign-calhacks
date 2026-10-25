"use client";
// Decision card (spec §7.2, right): what the Policy Engine decided, which rules fired and why.
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { formatCents, RAIL_LABEL } from "../../shared/ledger";
import { RULES } from "../../shared/policy/rules";
import type { Decision, PaymentRequest, PolicyResult, RuleId } from "../../shared/types";
import type { CaseDetail } from "./AgentLanes";
import { ruleInfo, secondsLeft, useNow } from "./format";

export type CaseRow = FunctionReturnType<typeof api.cases.recent>[number];

/** When several rules fired, the first of these present is the one worth reading first. */
const KEY_RULE_ORDER: RuleId[] = ["R10", "R18", "R17", "R16", "R13", "R9", "R8", "R1", "R12"];

export function DecisionCard({ c, detail }: { c: CaseRow; detail: CaseDetail | undefined }) {
  const now = useNow();
  const result = c.policyResult as PolicyResult | undefined;
  const decision: Decision | undefined = c.decision ?? result?.decision;
  const approval = detail?.approvals.at(-1);
  const coolingOff =
    approval?.approvedAt && !approval.cancelledAt && approval.coolingOffUntil && approval.coolingOffUntil > now
      ? approval.coolingOffUntil
      : null;
  const fired = new Set<RuleId>(result?.firedRules ?? []);
  const keyRule = KEY_RULE_ORDER.find((id) => fired.has(id)) ?? result?.firedRules[0];
  const reasonFor = (id: RuleId) => result?.reasons.find((reason) => reason.startsWith(`${id} `));

  return (
    <section className="lp-lockpanel wr-verdict" data-verdict={decision} aria-label="Decision">
      <p key={decision ?? c.status} className="wr-verdict-word" data-decision={decision} role="status" aria-live="polite">
        {decision ? verdictWord(decision, c.request as PaymentRequest | undefined) : `${c.status.replace(/_/g, " ")}…`}
      </p>
      {decision && <p className="wr-verdict-line">{explain(decision, result, detail)}</p>}
      {result && result.firedRules.length > 0 && (
        <ul className="lp-fired" aria-label="Rules that fired">
          {result.firedRules.map((id) => (
            <li key={id} data-key={id === keyRule ? "" : undefined} title={reasonFor(id)}>
              <b>{id}</b> {ruleInfo(id)?.name ?? "rule"}
            </li>
          ))}
        </ul>
      )}
      <ol className="lp-rules" aria-label={`All ${Object.keys(RULES).length} rules`}>
        {(Object.keys(RULES) as RuleId[]).map((id) => (
          <li key={id} data-state={fired.has(id) ? "fired" : decision ? "checked" : "idle"} title={`${id} ${RULES[id].name}`}>
            {id}
          </li>
        ))}
      </ol>
      {coolingOff && (
        <p className="wr-countdown" role="timer">
          Owner approved · cooling-off {secondsLeft(coolingOff, now)}s · the owner can still cancel
        </p>
      )}
      {result && result.reasons.length > 0 && (
        <details className="wr-more">
          <summary>Why</summary>
          <ul>
            {result.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function explain(decision: Decision, result: PolicyResult | undefined, detail: CaseDetail | undefined): string {
  const vendor = detail?.summary.vendorName ?? "the vendor";
  const payment = detail?.payments.find((p) => p.status === "sent");
  switch (decision) {
    case "PAY":
      return payment
        ? `Paid ${formatCents(payment.amountCents)} to ${vendor}'s account on file via ${RAIL_LABEL[payment.rail]}.`
        : "Every check passed. Releasing the payment to the account on file.";
    case "BLOCK":
      return result?.overridable === false
        ? "Refused. Nobody can override this, not even the owner."
        : "Refused. The owner has been alerted.";
    case "HOLD":
      if (result?.needs.callback) return `Holding while Countersign calls ${vendor} on the number already on file.`;
      return "Held. Nothing is paid until the missing check passes.";
    case "ESCALATE":
      return "Waiting for the owner's authenticator code. A voice or a text message is never enough.";
    case "NO_ACTION": {
      // "No payment was requested: a meeting request, passed to the owner" -> "Not a payment: a meeting request, …"
      const triage = result?.reasons[0]?.replace(/^No payment was requested:?\s*/, "");
      return triage && triage !== "nothing to pay" ? `Not a payment: ${triage}.` : "No payment was requested.";
    }
  }
}

/** The big word. A message that asks for no money is forwarded to the owner, filtered as spam, or just answered. */
function verdictWord(decision: Decision, request: PaymentRequest | undefined): string {
  if (decision !== "NO_ACTION") return decision;
  const type = request?.messageType;
  if (type === "sales_or_spam") return "FILTERED";
  if (type && type !== "payment") return "FORWARDED";
  return "NO ACTION";
}
