"use client";
// War Room (owner: P4). Spec §7.2. Everything shown here comes from real Convex rows; never animate fakes.
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const LANES = ["intake", "vendorVerifier", "riskAnalyst", "callback", "policy", "payer"] as const;

export default function WarRoom() {
  const cases = useQuery(api.cases.recent, { limit: 10 });
  const score = useQuery(api.scoreboard.get);
  const current = cases?.[0];

  return (
    <main>
      <header className="scoreboard">
        <strong>Countersign</strong>
        <span>Scam attempts: {score?.scamAttempts ?? "–"}</span>
        <span>Dollars lost: ${((score?.dollarsLostCents ?? 0) / 100).toFixed(0)}</span>
        <span>Real bills paid: {score?.realBillsPaid ?? "–"}</span>
        <span>Median decision: {score?.medianDecisionMs != null ? `${Math.round(score.medianDecisionMs / 1000)}s` : "–"}</span>
      </header>
      <div className="grid">
        <section className="panel">
          <h2>Incoming</h2>
          {current ? (
            <>
              <div className="muted">
                {current.channel} from {current.fromAddress}
              </div>
              <p>{current.rawContent}</p>
            </>
          ) : (
            <p className="muted">Waiting for a message…</p>
          )}
        </section>
        <section className="panel">
          <h2>Agents</h2>
          {current ? <AgentLanes caseId={current._id} /> : <p className="muted">No case yet.</p>}
        </section>
        <section className="panel">
          <h2>Decision</h2>
          {current?.decision ? <p style={{ fontSize: 32, margin: 0 }}>{current.decision}</p> : <p className="muted">{current?.status ?? "–"}</p>}
          {current && <AuditTrail caseId={current._id} />}
        </section>
      </div>
    </main>
  );
}

function AgentLanes({ caseId }: { caseId: Id<"cases"> }) {
  const runs = useQuery(api.agentRuns.forCase, { caseId }) ?? [];
  return (
    <>
      {LANES.map((agent) => {
        const run = [...runs].reverse().find((r) => r.agent === agent);
        return (
          <div key={agent} className="lane" data-status={run?.status ?? "idle"}>
            <strong>{agent}</strong> <span className="muted">{run?.status ?? "idle"}</span>
            {run?.summary && <div>{run.summary}</div>}
          </div>
        );
      })}
    </>
  );
}

function AuditTrail({ caseId }: { caseId: Id<"cases"> }) {
  const events = useQuery(api.audit.forCase, { caseId }) ?? [];
  return (
    <div className="mono" style={{ marginTop: 16 }}>
      {events.map((e) => (
        <div key={e._id}>
          #{e.seq} {e.actor} {e.action} <span className="muted">{e.hash.slice(0, 10)}</span>
        </div>
      ))}
    </div>
  );
}
