"use client";
// Live numbers strip (spec §7.2). Numbers come from convex/scoreboard.ts; definitions in shared/scoreboard.ts.
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { formatCents } from "../../shared/ledger";

export function Scoreboard() {
  const score = useQuery(api.scoreboard.get);
  const chain = useQuery(api.audit.verifyChain);
  const median = score?.medianDecisionMs;

  return (
    <header className="lp-livestrip wr-strip" aria-label="Live numbers">
      <p>
        <span className="lp-live-dot" aria-hidden="true" /> Live
      </p>
      <dl>
        <Metric label="requests" value={score?.requests} />
        <Metric label="scam attempts" value={score?.scamAttempts} />
        <Metric label="lost to scams" value={score ? formatCents(score.dollarsLostCents) : undefined} good />
        <Metric
          label="bills paid"
          value={score?.realBillsPaid}
          extra={score ? formatCents(score.dollarsPaidCents) : undefined}
        />
        <Metric label="median decision" value={median != null ? seconds(median) : score ? "—" : undefined} />
      </dl>
      <p className="wr-chain" role="status" aria-live="polite">
        {chain == null ? (
          <span className="muted">Checking audit chain…</span>
        ) : chain.ok ? (
          <span className="chain-ok">Audit chain verified · {chain.count} events</span>
        ) : (
          <span className="chain-bad">Audit chain broken at #{chain.brokenAtSeq}</span>
        )}
      </p>
    </header>
  );
}

/** "0.2s" under ten seconds, "38s" above. */
function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

/** One strip metric. The value comes before its label: the demo CSS orders `dd` before `dt`. */
function Metric(props: { label: string; value: string | number | undefined; extra?: string; good?: boolean }) {
  return (
    <div>
      <dd className={props.good ? "wr-good" : undefined}>
        {props.value ?? "–"}
        {props.extra && <small> {props.extra}</small>}
      </dd>
      <dt>{props.label}</dt>
    </div>
  );
}
