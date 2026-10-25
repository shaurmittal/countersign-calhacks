"use client";
// Lumen Bank (owner: P1). The sandbox bank's own view: balance, payee file, the live transfer ledger, and a
// panel that plays a hijacked agent: four real requests to POST /bank/transfers, each refused by the bank's
// own checks (convex/bank.ts). Everything shown comes from real rows and real HTTP responses.
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { generateCountersignKeys, signPayload, type ReleasePayload } from "../../shared/bank/payload";
import { formatCents } from "../../shared/ledger";
import "../demo/landing.css";
import "./bank.css";

/** The deployment's HTTP actions host (…convex.site), where POST /bank/transfers lives. */
function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return (process.env.NEXT_PUBLIC_CONVEX_URL ?? "").replace(/\.convex\.cloud\/?$/, ".convex.site");
}

type AttemptState = { status: "idle" | "sending" | "rejected" | "accepted" | "error"; reason?: string; http?: number };

type Attempt = {
  title: string;
  what: string;
  expect: string;
  needsSample?: boolean;
  build: (ctx: { sample: { payload: ReleasePayload; signature: string } | null; forged: () => Promise<JsonWebKey> }) => Promise<{ payload: unknown; signature?: string }>;
};

/** A transfer that looks perfect: copied from a real one, new nonce, a bigger amount, fresh timestamps. */
function crafted(sample: { payload: ReleasePayload } | null): ReleasePayload {
  const now = Date.now();
  const base: ReleasePayload = sample?.payload ?? {
    v: 1, caseId: "none", paymentId: "none", vendorId: "none", routing: "021000021", last4: "9921", amountCents: 1,
    invoiceNumber: "1042", decision: "PAY", firedRules: ["R12"], issuedAt: now, expiresAt: now, nonce: "x",
  };
  return { ...base, amountCents: 48_000_00, invoiceNumber: "1043", issuedAt: now, expiresAt: now + 120_000, nonce: crypto.randomUUID() };
}

const ATTEMPTS: Attempt[] = [
  {
    title: "No signature",
    what: "A perfectly formed $48,000 transfer, sent straight to the bank.",
    expect: "No countersignature",
    build: async ({ sample }) => ({ payload: crafted(sample) }),
  },
  {
    title: "Its own key",
    what: "The same transfer, signed with a key this page just made.",
    expect: "Countersignature invalid",
    build: async ({ sample, forged }) => {
      const payload = crafted(sample);
      return { payload, signature: await signPayload(payload, await forged()) };
    },
  },
  {
    title: "Edit a real one",
    what: "A real countersigned transfer with the amount changed to $48,000.",
    expect: "Countersignature invalid",
    needsSample: true,
    build: async ({ sample }) => ({ payload: { ...sample!.payload, amountCents: 48_000_00 }, signature: sample!.signature }),
  },
  {
    title: "Replay a real one",
    what: "A real countersigned transfer, sent again byte for byte.",
    expect: "Countersignature already used",
    needsSample: true,
    build: async ({ sample }) => ({ payload: sample!.payload, signature: sample!.signature }),
  },
];

export default function BankPage() {
  const overview = useQuery(api.bank.overview);
  const sample = useQuery(api.bank.replaySample);
  const [states, setStates] = useState<AttemptState[]>(ATTEMPTS.map(() => ({ status: "idle" })));
  const [running, setRunning] = useState(false);

  async function simulate() {
    if (running) return;
    setRunning(true);
    setStates(ATTEMPTS.map(() => ({ status: "idle" })));
    let forgedKey: JsonWebKey | null = null;
    const forged = async () => (forgedKey ??= (await generateCountersignKeys()).privateJwk);
    const realSample = sample ? { payload: sample.payload as ReleasePayload, signature: sample.signature } : null;
    for (const [i, a] of ATTEMPTS.entries()) {
      if (a.needsSample && !realSample) {
        setStates((s) => s.map((x, j) => (j === i ? { status: "error", reason: "Needs one real payment first: send “Pay Northwind #NW-889” on /try" } : x)));
        continue;
      }
      setStates((s) => s.map((x, j) => (j === i ? { status: "sending" } : x)));
      try {
        const body = await a.build({ sample: realSample, forged });
        const res = await fetch(`${siteUrl()}/bank/transfers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const json = (await res.json()) as { status: string; reason?: string };
        const status = json.status === "accepted" ? "accepted" : json.status === "rejected" ? "rejected" : "error";
        setStates((s) => s.map((x, j) => (j === i ? { status, reason: json.reason, http: res.status } : x)));
      } catch {
        setStates((s) => s.map((x, j) => (j === i ? { status: "error", reason: "Couldn't reach the bank" } : x)));
      }
      await new Promise((r) => setTimeout(r, 650));
    }
    setRunning(false);
  }

  const account = overview?.account;

  return (
    <div className="lp bk">
      <header className="bk-top">
        <a className="lp-logo" href="/demo">
          <BankMark /> LUMEN BANK
        </a>
        <span className="bk-tag">Sandbox bank for Lumen Labs</span>
        <nav className="bk-links" aria-label="Elsewhere">
          <a href="/" target="_blank" rel="noreferrer">War Room ↗</a>
          <a href="/try" target="_blank" rel="noreferrer">Try it ↗</a>
        </nav>
      </header>

      <main className="bk-main">
        <section className="bk-hero">
          <p className="lp-kicker">The second lock</p>
          <h1>
            This bank only moves money <span>Countersign signed.</span>
          </h1>
          <p className="bk-sub">
            When the Policy Engine says PAY, Countersign signs that exact transfer: who, how much, which invoice, once. The
            bank checks the signature against its own key and its own payee list. A request without a valid countersignature
            is refused at the door, however convincing it looks.
          </p>
        </section>

        <div className="bk-grid">
          <section className="bk-card bk-account" aria-label="Account">
            <p className="bk-label">{account?.name ?? "Operating account"}</p>
            <p className="bk-balance">{account ? formatCents(account.balanceCents) : overview === undefined ? "…" : "Not set up"}</p>
            <p className="bk-label">Payees on file</p>
            <ul className="bk-payees">
              {overview?.payees.map((p) => (
                <Payee key={p._id} p={p} />
              ))}
            </ul>
          </section>

          <section className="bk-card bk-hijack" aria-label="Simulate a hijacked agent">
            <p className="lp-kicker bk-kicker-red">Simulate a hijacked agent</p>
            <h2>Skip Countersign. Talk to the bank directly.</h2>
            <p className="bk-hijack-sub">
              Suppose an attacker controls an AI agent with network access. These are four real requests to the bank's
              public transfer endpoint, sent from this page.
            </p>
            <ol className="bk-attempts">
              {ATTEMPTS.map((a, i) => (
                <li key={a.title} data-state={states[i].status}>
                  <div className="bk-attempt-head">
                    <span className="bk-attempt-n">{i + 1}</span>
                    <span className="bk-attempt-title">{a.title}</span>
                    <Verdict s={states[i]} />
                  </div>
                  <p className="bk-attempt-what">{a.what}</p>
                  {states[i].reason && <p className="bk-attempt-reason">{states[i].reason}</p>}
                </li>
              ))}
            </ol>
            <button type="button" className="lp-btn lp-btn-primary bk-run" onClick={simulate} disabled={running || overview === undefined}>
              {running ? "Sending…" : "Send the four requests"}
            </button>
            <p className="bk-fine">POST {siteUrl().replace(/^https?:\/\//, "")}/bank/transfers</p>
          </section>
        </div>

        <section className="bk-card bk-ledger" aria-label="Transfer ledger">
          <div className="bk-ledger-head">
            <p className="bk-label">Transfer ledger</p>
            <span className="bk-live">
              <span className="lp-live-dot" aria-hidden="true" /> Live
            </span>
          </div>
          {overview && overview.transfers.length === 0 && <p className="bk-empty">No transfers yet. Pay a real bill on /try: “Pay Northwind #NW-889”.</p>}
          <ol className="bk-rows">
            {overview?.transfers.map((t) => (
              <li key={t._id} data-status={t.status}>
                <span className="bk-mark">{t.status === "accepted" ? "✓" : "✕"}</span>
                <span className="bk-row-main">
                  <b>{t.amountCents != null ? formatCents(t.amountCents) : "—"}</b> to {t.payeeName}
                  {t.memo && <span className="bk-muted"> · {t.memo}</span>}
                </span>
                <span className="bk-row-why">
                  {t.status === "accepted" ? (
                    <>Countersigned <span className="bk-mono">sig {t.sig}…</span></>
                  ) : (
                    t.reason
                  )}
                </span>
                <span className="bk-row-src">{t.source === "countersign" ? "Countersign Payer" : "Public endpoint"}</span>
                <span className="bk-mono bk-row-time">{new Date(t.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span>
              </li>
            ))}
          </ol>
        </section>

        <p className="bk-honest">
          Sandbox bank, fictional company, no real money. In this demo the bank and the signer run in one backend, and the
          bank only ever reads the public key. In production the bank holds only the public key and the signer runs in its own
          isolated service.
        </p>
      </main>
    </div>
  );
}

function Verdict({ s }: { s: AttemptState }) {
  if (s.status === "idle") return <span className="bk-verdict">Not sent</span>;
  if (s.status === "sending") return <span className="bk-verdict is-sending">Sending…</span>;
  if (s.status === "rejected") return <span className="bk-verdict is-rejected">✕ Rejected</span>;
  if (s.status === "accepted") return <span className="bk-verdict is-accepted">✓ Accepted</span>;
  return <span className="bk-verdict">Skipped</span>;
}

function BankMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 9.5 12 4l9 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3.5 20h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.6" r="1.2" fill="var(--lp-amber)" />
    </svg>
  );
}

type PayeeRow = NonNullable<ReturnType<typeof useQuery<typeof api.bank.overview>>>["payees"][number];

/** One payee, with "Change bank details": the bank freezes the payee and asks Countersign to check. */
function Payee({ p }: { p: PayeeRow }) {
  const request = useMutation(api.bank.requestBankChange);
  const [open, setOpen] = useState(false);
  const [routing, setRouting] = useState("");
  const [account, setAccount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await request({ payeeId: p._id, routing, account });
      setOpen(false);
      setRouting("");
      setAccount("");
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : "Couldn't send the change. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const refused = p.status === "active" && p.note && !p.noteOk;
  return (
    <li data-status={p.status}>
      <span className="bk-payee-name">{p.name}</span>
      <span className="bk-mono">…{p.accountLast4}{p.pendingLast4 && <span className="bk-pending"> → …{p.pendingLast4}?</span>}</span>
      {p.status === "frozen" ? (
        <span className="bk-frozen">{p.note ?? `Frozen: Countersign is calling ${p.name}`}</span>
      ) : (
        <span className={refused ? "bk-refused" : "bk-active"}>{p.note ?? "Active"}</span>
      )}
      {p.status === "active" && !open && (
        <button type="button" className="bk-change" onClick={() => setOpen(true)}>
          Change bank details
        </button>
      )}
      {open && (
        <form className="bk-change-form" onSubmit={submit}>
          <input inputMode="numeric" placeholder="New routing (9 digits)" value={routing} onChange={(e) => setRouting(e.target.value)} aria-label="New routing number" />
          <input inputMode="numeric" placeholder="New account number" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="New account number" />
          <div className="bk-change-actions">
            <button type="submit" className="lp-btn lp-btn-primary" disabled={busy || !routing || !account}>
              {busy ? "Sending…" : "Ask the bank to change it"}
            </button>
            <button type="button" className="bk-cancel" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <p className="bk-change-note">The bank freezes this payee and Countersign phones {p.name} on the number already on file before anything changes.</p>
          {error && <p className="bk-change-error" role="alert">{error}</p>}
        </form>
      )}
    </li>
  );
}

