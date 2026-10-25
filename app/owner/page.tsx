"use client";
// Owner approvals (owner: P4). Spec §6.5. The owner opens this on their phone. Approve, decline
// or cancel each need a code from the Countersign entry in their authenticator app; the code is
// checked server-side (convex/agents/ownerConcierge.ts). This page holds no secrets.
// Styled in the /demo look (landing.css tokens), like /try and /bank.
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { OWNER_CODE } from "../../shared/config";
import { formatCents } from "../../shared/ledger";
import { channelLabel, clockTime, secondsLeft, useNow } from "../components/format";
import { BankChangesSection } from "./BankChangesSection";
import { CodeBoxes, CodeClock } from "./CodeBoxes";
import { ListsSection } from "./ListsSection";
import "../demo/landing.css";
import "./owner.css";

type Pending = FunctionReturnType<typeof api.owner.pending>[number];
type OwnerAction = "approve" | "decline" | "cancel";

export default function OwnerPage() {
  const pending = useQuery(api.owner.pending);
  const feed = useQuery(api.owner.feed);
  const waiting = pending?.length ?? 0;
  const [allAlerts, setAllAlerts] = useState(false);
  const alerts = feed && (allAlerts ? feed : feed.slice(0, ALERTS_SHOWN));

  return (
    <div className="lp ow">
      <header className="ow-top">
        <a className="lp-logo" href="/demo">
          <LockMark /> COUNTERSIGN
        </a>
        <span className="ow-who">
          <span className="lp-live-dot" aria-hidden="true" /> Owner · Lumen Labs
        </span>
        <nav className="ow-links" aria-label="Elsewhere">
          <a href="/" target="_blank" rel="noreferrer">
            War Room ↗
          </a>
          <a href="/bank" target="_blank" rel="noreferrer">
            Bank ↗
          </a>
        </nav>
      </header>

      <main className="ow-main">
        <section className="ow-hero">
          <p className="lp-kicker">The second signer</p>
          <h1>Only you can release it.</h1>
          <p className="ow-sub">
            Known bills pay themselves. Anything new or unusual waits here for a code from your authenticator app. A voice on
            the phone, however familiar, is never enough.
          </p>
          <div className="ow-status">
            <span className="ow-count" data-waiting={waiting > 0 || undefined}>
              <b>{pending === undefined ? "…" : waiting}</b> waiting for you
            </span>
            <CodeClock />
          </div>
        </section>

        <section className="ow-section" aria-labelledby="waiting-h">
          <h2 id="waiting-h" className="ow-h">
            Waiting for you
          </h2>
          {pending === undefined ? (
            <p className="ow-muted">Loading…</p>
          ) : pending.length === 0 ? (
            <div className="ow-empty">
              <LockMark size={34} />
              <div>
                <p className="ow-empty-title">Nothing needs you right now.</p>
                <p className="ow-muted">Countersign is answering every call, email and message. Anything it can't settle on its own lands here.</p>
              </div>
            </div>
          ) : (
            pending.map((p) => <ApprovalCard key={p.caseId} item={p} />)
          )}
        </section>

        <BankChangesSection />

        <section className="ow-section" aria-labelledby="alerts-h">
          <h2 id="alerts-h" className="ow-h">
            Alerts
          </h2>
          {alerts && alerts.length > 0 ? (
            <ol className="ow-feed">
              {alerts.map((f) => {
                const { kind, label, rest } = parseAlert(f.text);
                return (
                  <li key={f._id} data-kind={kind}>
                    <span className="ow-feed-dot" aria-hidden="true" />
                    <div>
                      <p className="ow-feed-head">
                        <span className="ow-feed-kind">{label}</span>
                        <time dateTime={new Date(f.at).toISOString()}>
                          {clockTime(f.at)}
                          {f.caseRef && ` · case ${f.caseRef}`}
                        </time>
                      </p>
                      <p className="ow-feed-text">{rest}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="ow-muted">No alerts yet.</p>
          )}
          {feed && feed.length > ALERTS_SHOWN && (
            <button type="button" className="ow-more" onClick={() => setAllAlerts((v) => !v)}>
              {allAlerts ? "Show fewer" : `Show all ${feed.length}`}
            </button>
          )}
        </section>

        <ListsSection />

        <footer className="ow-foot">
          <b>Countersign will never ask for your code</b> by phone, text or email. Enter it only on this page or in your own
          ASI:One chat with Countersign.
        </footer>
      </main>
    </div>
  );
}

const ALERTS_SHOWN = 6;

const ALERT_KINDS: Record<string, string> = {
  PAY: "Paid",
  BLOCK: "Blocked",
  HOLD: "Held",
  ESCALATE: "Needs you",
  NO_ACTION: "Message",
};

/** "BLOCK (R10, R2): R10 Callback denied: …" -> a coloured label plus the readable rest. */
function parseAlert(text: string): { kind: string; label: string; rest: string } {
  const decision = text.match(/^(PAY|BLOCK|HOLD|ESCALATE|NO_ACTION)\s*(?:\(([^)]*)\))?:\s*/);
  if (decision) {
    const rest = text.slice(decision[0].length).replace(/\bR\d+ ([^:;]+): /g, "");
    return { kind: decision[1], label: `${ALERT_KINDS[decision[1]]}${decision[2] ? ` · ${decision[2]}` : ""}`, rest };
  }
  if (/^Approval needed/i.test(text)) return { kind: "ESCALATE", label: "Needs you", rest: text.replace(/^Approval needed:\s*/i, "") };
  if (/^Approved\b/i.test(text)) return { kind: "PAY", label: "Approved", rest: text };
  if (/^(Declined|Cancelled)\b/i.test(text)) return { kind: "BLOCK", label: text.split(/\W/)[0], rest: text };
  const message = text.match(/^Message \(([^)]*)\):\s*/);
  if (message) return { kind: "MESSAGE", label: `Message · ${message[1]}`, rest: text.slice(message[0].length) };
  return { kind: "INFO", label: "Note", rest: text };
}

/** "R6 Over auto-pay limit: $4,800.00 is over…" -> ["R6", "Over auto-pay limit", "$4,800.00 is over…"]. */
function splitReason(reason: string): { id: string | null; name: string | null; text: string } {
  const m = reason.match(/^(R\d+) ([^:]+):\s*(.*)$/);
  return m ? { id: m[1], name: m[2], text: m[3] } : { id: null, name: null, text: reason };
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
  const coolLeft = cooling ? secondsLeft(approval!.coolingOffUntil!, now) : 0;
  const coolTotal = cooling && approval?.approvedAt ? Math.max(1, (approval.coolingOffUntil! - approval.approvedAt) / 1000) : 1;
  return (
    <article className="ow-card" data-state={cooling ? "cooling" : "waiting"} aria-labelledby={`payee-${item.caseId}`}>
      <div className="ow-card-head">
        <span className="ow-badge">{cooling ? "Approved · cooling off" : "Needs your approval"}</span>
        <span className="ow-meta">
          {channelLabel(item.channel)} · {clockTime(item.createdAt)} · case {item.ref}
        </span>
      </div>

      <div className="ow-amount">{item.amountCents != null ? formatCents(item.amountCents) : "Amount unknown"}</div>
      <p className="ow-payee" id={`payee-${item.caseId}`}>
        to <b>{item.vendorName ?? "an unknown payee"}</b>
        {item.invoiceNumber && <span className="ow-mono"> · invoice #{item.invoiceNumber}</span>}
      </p>
      {!item.vendorOnFile && <p className="ow-warn">Not in your vendor book</p>}

      {item.reasons.length > 0 && (
        <div className="ow-why">
          <p className="ow-why-title">Why it's waiting</p>
          <ul>
            {item.reasons.map((r) => {
              const { id, name, text } = splitReason(r);
              return (
                <li key={r}>
                  {id && (
                    <span className="ow-rule" title={name ?? undefined}>
                      {id}
                    </span>
                  )}
                  <span>
                    {name && <b>{name}. </b>}
                    {text}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {cooling && (
        <div className="ow-cooling" role="timer">
          <div className="ow-cooling-bar">
            <span style={{ width: `${Math.max(0, Math.min(100, (coolLeft / coolTotal) * 100))}%` }} />
          </div>
          <p>
            Releases in <b>{coolLeft}s</b>. You can still cancel with a fresh code.
          </p>
        </div>
      )}

      <form className="ow-form" onSubmit={(e) => act(cooling ? "cancel" : "approve", e)}>
        <CodeBoxes id={codeId} value={code} onChange={setCode} describedBy={`help-${item.caseId}`} disabled={lockedFor > 0 || !approval} />
        <p className="ow-help" id={`help-${item.caseId}`}>
          {lockedFor > 0
            ? `Locked after too many wrong codes. Try again in ${lockedFor}s.`
            : !approval
              ? "Preparing the approval request…"
              : `${OWNER_CODE.digits} digits from the Countersign entry in your authenticator app. Each code works once.`}
        </p>
        {cooling ? (
          <div className="ow-actions single">
            <button type="submit" className="ow-btn ow-btn-danger" disabled={!ready}>
              Cancel payment
            </button>
          </div>
        ) : (
          <div className="ow-actions">
            <button type="button" className="ow-btn ow-btn-danger" disabled={!ready} onClick={() => act("decline")}>
              Decline
            </button>
            <button type="submit" className="ow-btn ow-btn-approve" disabled={!ready}>
              Approve {item.amountCents != null ? formatCents(item.amountCents) : ""}
            </button>
          </div>
        )}
        <div aria-live="polite">{result && <p className={`ow-result ${result.ok ? "ok" : "bad"}`}>{result.text}</p>}</div>
      </form>
    </article>
  );
}

function LockMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 15.6l1.8 1.8 3.4-3.6" stroke="var(--lp-amber)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
