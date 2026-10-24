"use client";
// Top bar (spec §7.2). Numbers come from convex/scoreboard.ts; definitions in shared/scoreboard.ts.
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { formatCents } from "../../shared/ledger";

export function Scoreboard() {
  const score = useQuery(api.scoreboard.get);
  const chain = useQuery(api.audit.verifyChain);
  const median = score?.medianDecisionMs;

  return (
    <header className="scoreboard">
      <div className="brand">
        <strong>Countersign</strong>
        <span>The second signer a one-person company never had</span>
      </div>
      <dl style={{ display: "contents" }}>
        <Metric label="Requests" value={score?.requests} />
        <Metric label="Scam attempts" value={score?.scamAttempts} />
        <Metric label="Dollars lost" value={score ? formatCents(score.dollarsLostCents) : undefined} good />
        <Metric
          label="Real bills paid"
          value={score?.realBillsPaid}
          extra={score ? formatCents(score.dollarsPaidCents) : undefined}
        />
        <Metric label="Median decision" value={median != null ? `${Math.round(median / 1000)}s` : score ? "—" : undefined} />
      </dl>
      <div className="mono" role="status" aria-live="polite">
        {chain == null ? (
          <span className="muted">Checking audit chain…</span>
        ) : chain.ok ? (
          <span className="chain-ok">Audit chain verified · {chain.count} events</span>
        ) : (
          <span className="chain-bad">Audit chain broken at #{chain.brokenAtSeq}</span>
        )}
      </div>
    </header>
  );
}

function Metric(props: { label: string; value: string | number | undefined; extra?: string; good?: boolean }) {
  return (
    <div className={`metric${props.good ? " good" : ""}`}>
      <dt>{props.label}</dt>
      <dd>
        {props.value ?? "–"}
        {props.extra && <small>{props.extra}</small>}
      </dd>
    </div>
  );
}
