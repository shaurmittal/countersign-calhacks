"use client";
// Decision card (spec §7.2, right): what the Policy Engine decided, which rules fired and why.
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { Decision, PolicyResult } from "../../shared/types";
import { formatCents, RAIL_LABEL } from "../../shared/ledger";
import type { CaseDetail } from "./AgentLanes";
import { ruleInfo, secondsLeft, useNow } from "./format";

export type CaseRow = FunctionReturnType<typeof api.cases.recent>[number];

export function DecisionCard({ c, detail }: { c: CaseRow; detail: CaseDetail | undefined }) {
  const now = useNow();
  const result = c.policyResult as PolicyResult | undefined;
  const decision: Decision | undefined = c.decision ?? result?.decision;
  const approval = detail?.approvals.at(-1);
  const coolingOff =
    approval?.approvedAt && !approval.cancelledAt && approval.coolingOffUntil && approval.coolingOffUntil > now
      ? approval.coolingOffUntil
      : null;

  return (
    <section className="panel decision-card" data-decision={decision} aria-labelledby="decision-heading">
      <h2 id="decision-heading">Decision</h2>
      {decision ? (
        <p className="decision-word" role="status" aria-live="polite">
          <DecisionIcon decision={decision} />
          {decision === "NO_ACTION" ? "NO ACTION" : decision}
        </p>
      ) : (
        <p className="decision-word" role="status" aria-live="polite">
          {c.status.replace("_", " ")}…
        </p>
      )}
      {decision && <p className="decision-line">{explain(decision, result, detail)}</p>}
      {result && result.firedRules.length > 0 && (
        <div className="rules" aria-label="Rules that fired">
          {result.firedRules.map((id) => (
            <span key={id} className="chip" title={ruleInfo(id)?.description}>
              {id} · {ruleInfo(id)?.name ?? "rule"}
            </span>
          ))}
        </div>
      )}
      {result && result.reasons.length > 0 && (
        <ul className="reasons">
          {result.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {coolingOff && (
        <div className="countdown" role="timer">
          Owner approved. Cooling-off: payment releases in <strong>{secondsLeft(coolingOff, now)}s</strong> unless the owner
          cancels.
        </div>
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
    case "NO_ACTION":
      return "No payment was requested.";
  }
}

function DecisionIcon({ decision }: { decision: Decision }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, "aria-hidden": true } as const;
  switch (decision) {
    case "PAY":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="m7.5 12.5 3 3 6-6.5" />
        </svg>
      );
    case "HOLD":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M10 8v8M14 8v8" />
        </svg>
      );
    case "ESCALATE":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 17V8m-4 4 4-4 4 4" />
        </svg>
      );
    case "BLOCK":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="m5 5 14 14" />
        </svg>
      );
    case "NO_ACTION":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 11v6M12 7.5v.5" />
        </svg>
      );
  }
}
