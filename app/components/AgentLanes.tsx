"use client";
// Agent lanes (spec §7.2, center). Each lane is the latest real agentRuns row for that agent,
// plus the rows it produced (callbacks, approvals, payments). Nothing here is animated for show:
// a lane moves only when its row changes.
import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import type { api } from "../../convex/_generated/api";
import type { AgentName, PaymentRequest, PolicyResult, RiskFindings, VendorFindings } from "../../shared/types";
import { formatCents, RAIL_LABEL } from "../../shared/ledger";
import { clockTime, last4, ruleInfo, secondsLeft, useNow } from "./format";

export type CaseDetail = NonNullable<FunctionReturnType<typeof api.warRoom.caseDetail>>;
type Run = CaseDetail["runs"][number];

const LANES: { agent: AgentName; title: string; tech: string }[] = [
  { agent: "intake", title: "Intake Parser", tech: "Claude · untrusted text in, fields out" },
  { agent: "vendorVerifier", title: "Vendor Verifier", tech: "Vendor book · CRS · OFAC" },
  { agent: "riskAnalyst", title: "Risk Analyst", tech: "Rules + Claude explanation" },
  { agent: "callback", title: "Callback Verifier", tech: "Cartesia · number on file only" },
  { agent: "policy", title: "Policy Engine", tech: "Deterministic code · no LLM · only one that can say PAY" },
  { agent: "ownerConcierge", title: "Owner Concierge", tech: "Authenticator code · ASI:One" },
  { agent: "payer", title: "Payer", tech: "Increase sandbox · mock ledger" },
];

export function AgentLanes({ detail }: { detail: CaseDetail }) {
  return (
    <div className="lanes">
      {LANES.map((lane) => {
        const run = latestRun(detail.runs, lane.agent);
        const status = run?.status ?? "idle";
        return (
          <section key={lane.agent} className="lane" data-status={status} aria-label={`${lane.title}: ${status}`}>
            <div className="lane-head">
              <strong>{lane.title}</strong>
              <span className="tech">{lane.tech}</span>
              <span className="lane-status">{status}</span>
            </div>
            {run?.summary && <div className="lane-summary">{run.summary}</div>}
            {run?.error && <p className="lane-error">Failed: {run.error}</p>}
            <LaneDetail agent={lane.agent} run={run} detail={detail} />
          </section>
        );
      })}
    </div>
  );
}

function latestRun(runs: Run[], agent: AgentName): Run | undefined {
  return runs.filter((r) => r.agent === agent).sort((a, b) => b.startedAt - a.startedAt)[0];
}

function LaneDetail({ agent, run, detail }: { agent: AgentName; run: Run | undefined; detail: CaseDetail }) {
  switch (agent) {
    case "intake":
      return run?.output ? <IntakeDetail request={run.output as PaymentRequest} /> : null;
    case "vendorVerifier":
      return run?.output ? <VendorDetail findings={run.output as VendorFindings} detail={detail} /> : null;
    case "riskAnalyst":
      return run?.output ? <RiskDetail risk={run.output as RiskFindings} /> : null;
    case "callback":
      return <CallbackDetail detail={detail} />;
    case "policy":
      return run?.output ? <PolicyDetail result={run.output as PolicyResult} /> : null;
    case "ownerConcierge":
      return <OwnerDetail detail={detail} />;
    case "payer":
      return <PayerDetail detail={detail} />;
  }
}

function Chips({ children }: { children: ReactNode }) {
  return <div className="lane-body">{children}</div>;
}

function IntakeDetail({ request: r }: { request: PaymentRequest }) {
  return (
    <Chips>
      <span className="chip">Action: {r.requestedAction}</span>
      {r.claimedVendorName && <span className="chip">Payee claimed: {r.claimedVendorName}</span>}
      {r.amountCents != null && <span className="chip">{formatCents(r.amountCents)}</span>}
      {r.invoiceNumber && <span className="chip">Invoice #{r.invoiceNumber}</span>}
      <span className="chip">Sender says: {r.claimedSenderRole}</span>
      {r.newBankDetails && <span className="chip warn">New bank {last4(r.newBankDetails.account)}</span>}
      {r.urgencyClaims?.map((u) => (
        <span key={u} className="chip warn">
          Urgency: “{u}”
        </span>
      ))}
      {r.injectionAttempt && <span className="chip bad">Injection attempt</span>}
    </Chips>
  );
}

function VendorDetail({ findings: f, detail }: { findings: VendorFindings; detail: CaseDetail }) {
  const matched = f.vendorId && detail.summary.vendorOnFile;
  return (
    <Chips>
      {matched ? (
        <span className="chip ok">
          Match: {detail.summary.vendorName} ({Math.round(f.matchConfidence * 100)}%)
        </span>
      ) : (
        <span className="chip bad">No vendor-book match</span>
      )}
      <span className={`chip ${f.senderOnFile ? "ok" : "warn"}`}>Sender {f.senderOnFile ? "on file" : "not on file"}</span>
      {f.bankMatches != null && (
        <span className={`chip ${f.bankMatches ? "ok" : "bad"}`}>Bank {f.bankMatches ? "matches file" : "differs from file"}</span>
      )}
      <span className={`chip ${crsTone(f)}`}>CRS: {crsLabel(f)}</span>
      <span className={`chip ${f.ofacHit ? "bad" : "ok"}`}>OFAC: {f.ofacHit ? "HIT" : "clear"}</span>
      {f.alreadyPaidAt != null ? (
        <span className="chip bad">Invoice already paid</span>
      ) : (
        <span className={`chip ${f.matchingInvoiceId ? "ok" : "warn"}`}>
          {f.matchingInvoiceId ? `Open invoice #${detail.summary.invoiceNumber ?? "?"}` : "No matching invoice"}
        </span>
      )}
    </Chips>
  );
}

function crsLabel(f: VendorFindings): string {
  if (f.crs?.status === "ok") return f.crs.businessVerified === false ? "not verified" : "business verified";
  return f.crs?.status === "unavailable" ? "unavailable" : "not checked";
}

function crsTone(f: VendorFindings): string {
  if (f.crs?.status === "ok") return f.crs.businessVerified === false ? "bad" : "ok";
  return f.crs?.status === "unavailable" ? "warn" : "";
}

function RiskDetail({ risk }: { risk: RiskFindings }) {
  const score = Math.max(0, Math.min(100, risk.riskScore ?? 0));
  return (
    <>
      <Chips>
        <span className="chip">Risk {score}/100 (display only)</span>
        {risk.flags?.map((flag) => (
          <span key={flag} className="chip warn">
            {flag.replace(/_/g, " ")}
          </span>
        ))}
        <div className="meter" role="img" aria-label={`Risk score ${score} of 100`}>
          <span style={{ transform: `scaleX(${score / 100})` }} />
        </div>
      </Chips>
      {risk.explanation && <p className="lane-note">{risk.explanation}</p>}
    </>
  );
}

const OUTCOME_TONE: Record<string, string> = { confirmed: "ok", denied: "bad", no_answer: "warn", unclear: "warn" };

function CallbackDetail({ detail }: { detail: CaseDetail }) {
  const latest = [...detail.callbacks].sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!latest) return null;
  return (
    <>
      <Chips>
        <span className="chip">
          Dialed {latest.numberDialed} (number on file) · attempt {latest.attempt}
        </span>
        {latest.outcome ? (
          <span className={`chip ${OUTCOME_TONE[latest.outcome] ?? ""}`}>Vendor said: {latest.outcome.replace("_", " ")}</span>
        ) : (
          <span className="chip info">Calling…</span>
        )}
      </Chips>
      {latest.transcript && <pre className="transcript">{latest.transcript}</pre>}
    </>
  );
}

function PolicyDetail({ result }: { result: PolicyResult }) {
  return (
    <Chips>
      {result.firedRules.map((id) => (
        <span key={id} className="chip" title={ruleInfo(id)?.description}>
          {id} {ruleInfo(id)?.name}
        </span>
      ))}
      {result.needs.callback && <span className="chip info">Needs callback</span>}
      {result.needs.ownerOtp && <span className="chip info">Needs owner code</span>}
      {!result.overridable && <span className="chip bad">Not overridable</span>}
    </Chips>
  );
}

function OwnerDetail({ detail }: { detail: CaseDetail }) {
  const now = useNow();
  const approval = [...detail.approvals].sort((a, b) => b.requestedAt - a.requestedAt)[0];
  if (!approval) return null;
  const via = approval.method === "otp" ? "owner page" : "ASI:One";
  let state: ReactNode;
  if (approval.cancelledAt) state = <span className="chip bad">Declined by owner via {via}</span>;
  else if (approval.approvedAt && approval.coolingOffUntil && approval.coolingOffUntil > now) {
    state = <span className="chip warn">Approved · cooling-off {secondsLeft(approval.coolingOffUntil, now)}s</span>;
  } else if (approval.approvedAt) state = <span className="chip ok">Approved by owner via {via}</span>;
  else state = <span className="chip info">Waiting for the owner&apos;s code since {clockTime(approval.requestedAt)}</span>;

  const locked = approval.lockedUntil && approval.lockedUntil > now;
  return (
    <Chips>
      {state}
      {locked && <span className="chip bad">Locked after wrong codes · {secondsLeft(approval.lockedUntil!, now)}s</span>}
      {!locked && (approval.attempts ?? 0) > 0 && <span className="chip warn">{approval.attempts} wrong code(s)</span>}
    </Chips>
  );
}

function PayerDetail({ detail }: { detail: CaseDetail }) {
  const payment = [...detail.payments].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!payment) return null;
  const tone = payment.status === "sent" ? "ok" : payment.status === "failed" ? "bad" : "info";
  return (
    <>
      <Chips>
        <span className="chip">{RAIL_LABEL[payment.rail]}</span>
        <span className={`chip ${tone}`}>
          {formatCents(payment.amountCents)} · {payment.status}
        </span>
        {payment.externalId && <span className="chip mono">{payment.externalId}</span>}
      </Chips>
      {payment.status === "sent" && (
        <table className="journal">
          <caption className="sr-only">Journal entry</caption>
          <thead>
            <tr>
              <th>Account</th>
              <th className="amt">Debit</th>
              <th className="amt">Credit</th>
            </tr>
          </thead>
          <tbody>
            {payment.journal.map((line) => (
              <tr key={line.account}>
                <td>{line.account}</td>
                <td className="amt">{line.debitCents ? formatCents(line.debitCents) : ""}</td>
                <td className="amt">{line.creditCents ? formatCents(line.creditCents) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
