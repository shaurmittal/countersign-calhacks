"use client";
// Owner approvals (owner: P4). Spec §6.5. The owner opens this on their phone. Approve, decline
// or cancel each need a code from the Countersign entry in their authenticator app; the code is
// checked server-side (convex/agents/ownerConcierge.ts). This page holds no secrets.
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { OWNER_CODE } from "../../shared/config";
import { formatCents } from "../../shared/ledger";
import { channelLabel, clockTime, ruleInfo, secondsLeft, useNow } from "../components/format";
import "./owner.css";

type Pending = FunctionReturnType<typeof api.owner.pending>[number];
type OwnerAction = "approve" | "decline" | "cancel";

export default function OwnerPage() {
  const pending = useQuery(api.owner.pending);
  const feed = useQuery(api.owner.feed);

  return (
    <main className="owner">
      <header className="owner-header">
        <h1>Countersign · Owner approvals</h1>
        <p>Known bills are paid on their own. Anything new or unusual waits here for you.</p>
      </header>

      <h2>Waiting for you</h2>
      {pending === undefined ? (
        <p className="muted">Loading…</p>
      ) : pending.length === 0 ? (
        <p className="muted">Nothing needs your approval right now.</p>
      ) : (
        pending.map((p) => <ApprovalCard key={p.caseId} item={p} />)
      )}

      <h2>Alerts</h2>
      {feed && feed.length > 0 ? (
        <ul className="feed">
          {feed.map((f) => (
            <li key={f._id}>
              <time dateTime={new Date(f.at).toISOString()}>
                {clockTime(f.at)}
                {f.caseRef && ` · case ${f.caseRef}`}
              </time>
              {f.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No alerts yet.</p>
      )}

      <footer className="owner-footer">
        Countersign will never ask for your code by phone, text or email. Enter it only on this page or in your own
        ASI:One chat with Countersign.
      </footer>
    </main>
  );
}

function ApprovalCard({ item }: { item: Pending }) {
  const now = useNow();
  const submit = useMutation(api.agents.ownerConcierge.submitCode);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const approval = item.approval;
  const cooling = !!approval?.approvedAt && !!approval.coolingOffUntil && approval.coolingOffUntil > now;
  const lockedFor = approval?.lockedUntil && approval.lockedUntil > now ? secondsLeft(approval.lockedUntil, now) : 0;
  const codeId = `code-${item.caseId}`;

  async function act(action: OwnerAction, e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await submit({ caseId: item.caseId, code, action });
      setResult(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
      if (res.ok) setCode("");
    } catch {
      setResult({ ok: false, text: "Couldn't reach Countersign. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const ready = code.length === OWNER_CODE.digits && !busy && lockedFor === 0 && !!approval;
  return (
    <article className="approval" data-state={cooling ? "cooling" : "waiting"} aria-labelledby={`payee-${item.caseId}`}>
      <div>
        <div className="approval-amount">{item.amountCents != null ? formatCents(item.amountCents) : "Amount unknown"}</div>
        <div className="approval-payee" id={`payee-${item.caseId}`}>
          {item.vendorName ?? "Unknown payee"}
          {!item.vendorOnFile && " (not in your vendor book)"}
        </div>
        <div className="approval-meta">
          {item.invoiceNumber && `Invoice #${item.invoiceNumber} · `}
          {channelLabel(item.channel)} · {clockTime(item.createdAt)} · case {item.ref}
        </div>
      </div>
      {item.firedRules.length > 0 && (
        <div className="rules">
          {item.firedRules.map((id) => (
            <span key={id} className="chip" title={ruleInfo(id)?.description}>
              {id} · {ruleInfo(id)?.name ?? "rule"}
            </span>
          ))}
        </div>
      )}
      {item.reasons.length > 0 && (
        <ul>
          {item.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {cooling && (
        <p className="timer" role="timer">
          Approved. Payment releases in {secondsLeft(approval!.coolingOffUntil!, now)}s. You can still cancel.
        </p>
      )}

      <form className="code-form" onSubmit={(e) => act(cooling ? "cancel" : "approve", e)}>
        <label htmlFor={codeId}>Code from your authenticator app</label>
        <input
          id={codeId}
          className="code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={OWNER_CODE.digits}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, OWNER_CODE.digits))}
          aria-describedby={`help-${item.caseId}`}
        />
        <p className="code-help" id={`help-${item.caseId}`}>
          {lockedFor > 0
            ? `Locked after too many wrong codes. Try again in ${lockedFor}s.`
            : !approval
              ? "Preparing the approval request…"
              : `${OWNER_CODE.digits} digits, from the Countersign entry. Codes change every ${OWNER_CODE.periodSeconds} seconds.`}
        </p>
        {cooling ? (
          <div className="actions single">
            <button type="submit" className="btn btn-danger" disabled={!ready}>
              Cancel payment
            </button>
          </div>
        ) : (
          <div className="actions">
            <button type="button" className="btn btn-danger" disabled={!ready} onClick={() => act("decline")}>
              Decline
            </button>
            <button type="submit" className="btn btn-primary" disabled={!ready}>
              Approve
            </button>
          </div>
        )}
        <div aria-live="polite">{result && <p className={`result ${result.ok ? "ok" : "bad"}`}>{result.text}</p>}</div>
      </form>
    </article>
  );
}
