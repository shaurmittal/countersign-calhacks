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
import { AnimatePresence, motion } from "framer-motion";
import { Check, LoaderCircle, Send, X } from "lucide-react";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { AppShell } from "../ui/AppShell";
import { cn } from "../ui/cn";
import { spring } from "../ui/motion";
import { buttonClass, SectionHead, Stamp } from "../ui/primitives";

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
  const doneCount = states.filter((x) => x.status === "rejected" || x.status === "accepted").length;

  return (
    <AppShell
      title="Lumen Bank"
      subtitle="A sandbox bank that only moves money Countersign signed. When the Policy Engine says PAY, the Payer signs that exact transfer: who, how much, which invoice, once. Anything without a valid countersignature is refused at the door."
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section aria-label="Account" className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-5 sm:px-6">
            <p className="text-[12.5px] text-muted-foreground">{account?.name ?? "Operating account"}</p>
            <p className="mt-2 text-[34px] font-medium leading-none tracking-[-0.03em] sm:text-[40px]">
              {account ? (
                <AnimatedNumber value={formatCents(account.balanceCents)} className="font-sans" />
              ) : overview === undefined ? (
                <span className="skeleton inline-block h-10 w-56" />
              ) : (
                "Not set up"
              )}
            </p>
          </div>
          <div className="px-5 py-5 sm:px-6">
            <SectionHead title="Payees on file">
              <span>routing and last 4 only</span>
            </SectionHead>
            <ul className="space-y-px overflow-hidden rounded-lg border border-border bg-border">
              {overview?.payees.map((p) => (
                <Payee key={p._id} p={p} />
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="hijack-title" className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-5 sm:px-6">
            <h2 id="hijack-title" className="text-[18px] font-medium tracking-[-0.015em]">
              Simulate a hijacked agent
            </h2>
            <p className="mt-1.5 max-w-[60ch] text-[13.5px] leading-relaxed text-muted-foreground">
              Suppose an attacker controls an AI agent with network access and skips Countersign to talk to the bank directly.
              These are four real requests to the bank&apos;s public transfer endpoint, sent from this page.
            </p>
          </div>
          <ol className="divide-y divide-border">
            {ATTEMPTS.map((a, i) => (
              <li key={a.title} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-x-3 px-5 py-4 sm:px-6">
                <span className="grid size-6 place-items-center rounded-md border border-border-strong font-mono text-[11.5px] text-muted-foreground">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[14px] font-medium">{a.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{a.what}</p>
                  {states[i].reason && (
                    <motion.p
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={spring.smooth}
                      className={cn("mt-1.5 font-mono text-[12.5px]", states[i].status === "accepted" ? "text-pay-ink" : states[i].status === "rejected" ? "text-block-ink" : "text-hold-ink")}
                    >
                      Bank: “{states[i].reason}”
                    </motion.p>
                  )}
                </div>
                <Verdict s={states[i]} />
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-5 py-4 sm:px-6">
            <button type="button" className={buttonClass("primary")} onClick={simulate} disabled={running || overview === undefined}>
              <Send className="size-4" aria-hidden="true" />
              {running ? `Sending ${Math.min(doneCount + 1, ATTEMPTS.length)} of ${ATTEMPTS.length}…` : "Send the four requests"}
            </button>
            <p className="min-w-0 truncate font-mono text-[11.5px] text-subtle">POST {siteUrl().replace(/^https?:\/\//, "")}/bank/transfers</p>
          </div>
        </section>
      </div>

      <section aria-label="Transfer ledger" className="mt-6">
        <SectionHead title="Transfer ledger">
          <span className="flex items-center gap-2">
            <span className="live-dot" aria-hidden="true" /> Live
          </span>
        </SectionHead>
        {overview && overview.transfers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong px-5 py-8 text-center text-[13.5px] text-muted-foreground">
            No transfers yet. Pay a real bill on /try: “Pay Northwind #NW-889”.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-[13px] max-md:block">
              <thead className="max-md:hidden">
                <tr className="border-b border-border text-left text-[12px] text-subtle">
                  <th className="w-10 py-2.5 pl-4 font-normal">
                    <span className="sr-only">Result</span>
                  </th>
                  <th className="py-2.5 font-normal">Transfer</th>
                  <th className="py-2.5 font-normal">Bank&apos;s answer</th>
                  <th className="hidden py-2.5 font-normal md:table-cell">Door</th>
                  <th className="py-2.5 pr-4 text-right font-normal">Time</th>
                </tr>
              </thead>
              <tbody className="max-md:block">
                <AnimatePresence initial={false}>
                  {overview?.transfers.map((t) => (
                    <motion.tr
                      key={t._id}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={spring.smooth}
                      className="border-b border-border last:border-0 max-md:grid max-md:grid-cols-[28px_minmax(0,1fr)_auto] max-md:px-3 max-md:py-2.5"
                    >
                      <td className="py-3 pl-4 max-md:row-span-2 max-md:py-0.5 max-md:pl-0">
                        {t.status === "accepted" ? (
                          <Check className="size-4 text-pay-ink" aria-label="Accepted" />
                        ) : (
                          <X className="size-4 text-block-ink" aria-label="Rejected" />
                        )}
                      </td>
                      <td className="py-3 pr-4 max-md:py-0">
                        <span className={cn("font-mono", t.status === "rejected" && "struck text-muted-foreground")}>
                          {t.amountCents != null ? formatCents(t.amountCents) : "—"}
                        </span>{" "}
                        <span className="text-foreground/90">to {t.payeeName}</span>
                        {t.memo && <span className="text-subtle"> · {t.memo}</span>}
                      </td>
                      <td className="py-3 pr-4 max-md:col-start-2 max-md:col-end-4 max-md:row-start-2 max-md:py-0.5">
                        {t.status === "accepted" ? (
                          <span className="text-pay-ink">
                            Countersigned <span className="font-mono text-[12px] text-muted-foreground">sig {t.sig}…</span>
                          </span>
                        ) : (
                          <span className="text-block-ink">{t.reason}</span>
                        )}
                      </td>
                      <td className="hidden py-3 pr-4 text-muted-foreground md:table-cell">{t.source === "countersign" ? "Countersign Payer" : "Public endpoint"}</td>
                      <td className="py-3 pr-4 text-right font-mono text-[12.5px] text-subtle max-md:col-start-3 max-md:row-start-1 max-md:py-0 max-md:pr-0">
                        {new Date(t.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-8 max-w-[72ch] text-[12.5px] leading-relaxed text-subtle">
        Sandbox bank, fictional company, no real money. In this demo the bank and the signer run in one backend, and the bank
        only ever reads the public key. In production the bank holds only the public key and the signer runs in its own isolated
        service.
      </p>
    </AppShell>
  );
}

function Verdict({ s }: { s: AttemptState }) {
  if (s.status === "idle") return <Stamp tone="quiet" size="sm">Not sent</Stamp>;
  if (s.status === "sending")
    return (
      <span className="flex h-5 items-center gap-1.5 text-[12px] text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> Sending
      </span>
    );
  if (s.status === "rejected") return <Stamp tone="block" size="sm">Rejected</Stamp>;
  if (s.status === "accepted") return <Stamp tone="pay" size="sm">Accepted</Stamp>;
  return <Stamp tone="hold" size="sm">Skipped</Stamp>;
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

  const frozen = p.status === "frozen";
  const refused = p.status === "active" && p.note && !p.noteOk;
  const field = "h-9 w-full rounded-lg border border-border-strong bg-background px-3 font-mono text-[13px] outline-none focus:border-foreground";
  return (
    <li className={cn("bg-background px-4 py-3.5", frozen && "bg-hold/[0.05]")}>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[14px] font-medium">{p.name}</p>
        <p className="shrink-0 font-mono text-[13px] text-muted-foreground">
          …{p.accountLast4}
          {p.pendingLast4 && <span className="text-hold-ink"> → …{p.pendingLast4}?</span>}
        </p>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className={cn("text-[12.5px]", frozen ? "text-hold-ink" : refused ? "text-block-ink" : p.noteOk ? "text-pay-ink" : "text-muted-foreground")}>
          {frozen ? (p.note ?? `Frozen: Countersign is calling ${p.name}`) : (p.note ?? "Active")}
        </p>
        {p.status === "active" && !open && (
          <button type="button" className="text-[12.5px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setOpen(true)}>
            Change bank details
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.smooth}
            className="overflow-hidden"
            onSubmit={submit}
          >
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input className={field} inputMode="numeric" placeholder="New routing (9 digits)" value={routing} onChange={(e) => setRouting(e.target.value)} aria-label="New routing number" />
              <input className={field} inputMode="numeric" placeholder="New account number" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="New account number" />
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              The bank freezes this payee, and Countersign phones {p.name} on the number already on file before anything changes.
            </p>
            {error && (
              <p className="mt-2 text-[12.5px] text-block-ink" role="alert">
                {error}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button type="submit" className={buttonClass("primary", "h-8 px-3")} disabled={busy || !routing || !account}>
                {busy ? "Sending…" : "Ask the bank to change it"}
              </button>
              <button type="button" className={buttonClass("ghost", "h-8 px-3")} onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </li>
  );
}
