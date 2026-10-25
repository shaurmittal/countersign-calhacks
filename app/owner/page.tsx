"use client";
// Owner approvals (owner: P4). Spec §6.5. The owner opens this on their phone. Approve, decline
// or cancel each need a code from the Countersign entry in their authenticator app; the code is
// checked server-side (convex/agents/ownerConcierge.ts). This page holds no secrets.
// Features from the /owner redesign on main (code-rollover ring, cooling-off bar, reasons by rule, labelled
// alerts with show-all, lists under Advanced) carried into the app's design system.
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { OWNER_CODE } from "../../shared/config";
import { formatCents } from "../../shared/ledger";
import { AppShell } from "../ui/AppShell";
import { cn } from "../ui/cn";
import { OtpInput } from "../ui/OtpInput";
import { buttonClass, SectionHead, Stamp, Tag, type Tone } from "../ui/primitives";
import { channelLabel, clockTime, ruleInfo, secondsLeft, useNow } from "../components/format";
import { BankChangesSection } from "./BankChangesSection";
import { CodeClock } from "./CodeClock";
import { ListsSection } from "./ListsSection";

type Pending = FunctionReturnType<typeof api.owner.pending>[number];
type OwnerAction = "approve" | "decline" | "cancel";

export default function OwnerPage() {
  const pending = useQuery(api.owner.pending);
  const feed = useQuery(api.owner.feed);
  const changes = useQuery(api.bank.pendingChanges);
  const [allAlerts, setAllAlerts] = useState(false);
  const alerts = feed && (allAlerts ? feed : feed.slice(0, ALERTS_SHOWN));

  return (
    <AppShell
      icon={<ShieldCheck />}
      tone="owner"
      title="Only you can release it"
      subtitle="Known bills pay themselves. Anything new or unusual waits here for a code from Priya's authenticator app. A voice on the phone, however familiar, is never enough."
      actions={<CodeClock />}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="waiting-title">
            <SectionHead title={<span id="waiting-title">Waiting for you</span>}>
              {pending && pending.length > 0 && <span className="font-mono">{pending.length}</span>}
            </SectionHead>
            {pending === undefined ? (
              <div className="skeleton h-56 rounded-xl" />
            ) : pending.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-strong px-5 py-8 text-center text-[13.5px] text-muted-foreground">
                {changes && changes.length > 0
                  ? "No payments need your approval. A bank-detail change is waiting for your code below."
                  : "Nothing needs your approval right now. When a payment does, it appears here and in your alerts."}
              </p>
            ) : (
              <div className="space-y-4">
                {pending.map((p) => (
                  <ApprovalCard key={p.caseId} item={p} />
                ))}
              </div>
            )}
          </section>

          <BankChangesSection />
          <details className="group rounded-xl border border-border px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-owner-ink select-none [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 transition-transform duration-200 group-open:rotate-90" aria-hidden="true" />
              Advanced · block and trust lists
            </summary>
            <div className="mt-5">
              <ListsSection />
            </div>
          </details>
        </div>

        <aside aria-labelledby="alerts-title" className="lg:sticky lg:top-6 lg:self-start">
          <SectionHead title={<span id="alerts-title">Alerts</span>} />
          {alerts && alerts.length > 0 ? (
            <ol className="space-y-px overflow-hidden rounded-xl border border-border bg-border">
              {alerts.map((f) => (
                <li key={f._id} className="bg-background px-4 py-3">
                  <p className="mb-1 font-mono text-[11.5px] text-subtle">
                    <time dateTime={new Date(f.at).toISOString()}>{clockTime(f.at)}</time>
                    {f.caseRef && ` · case ${f.caseRef}`}
                  </p>
                  <p className="text-[13px] leading-relaxed text-foreground/90">
                    <AlertText text={f.text} />
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-muted-foreground">{feed === undefined ? "Loading…" : "No alerts yet."}</p>
          )}
          {feed && feed.length > ALERTS_SHOWN && (
            <button type="button" className={buttonClass("ghost", "mt-3 h-8 w-full")} onClick={() => setAllAlerts((v) => !v)}>
              {allAlerts ? "Show fewer" : `Show all ${feed.length}`}
            </button>
          )}
          <p className="mt-6 text-[12px] leading-relaxed text-subtle">
            Countersign will never ask for your code by phone, text or email. Enter it only on this page or in your own ASI:One
            chat with Countersign.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}

const ALERTS_SHOWN = 6;

const ALERT_KINDS: Record<string, { label: string; tone: Tone }> = {
  PAY: { label: "Paid", tone: "pay" },
  BLOCK: { label: "Blocked", tone: "block" },
  HOLD: { label: "Held", tone: "hold" },
  ESCALATE: { label: "Needs you", tone: "owner" },
  NO_ACTION: { label: "Message", tone: "quiet" },
};

/** "BLOCK (R10, R2): R10 Callback denied: …" -> a labelled stamp plus the readable rest. */
function parseAlert(text: string): { label: string; tone: Tone; rest: string } {
  const decision = text.match(/^(PAY|BLOCK|HOLD|ESCALATE|NO_ACTION)\s*(?:\(([^)]*)\))?:\s*/);
  if (decision) {
    const kind = ALERT_KINDS[decision[1]];
    const rest = text.slice(decision[0].length).replace(/\bR\d+ ([^:;]+): /g, "");
    return { label: decision[2] ? `${kind.label} · ${decision[2]}` : kind.label, tone: kind.tone, rest };
  }
  if (/^Approval needed/i.test(text)) return { label: "Needs you", tone: "owner", rest: text.replace(/^Approval needed:\s*/i, "") };
  if (/^Approved\b/i.test(text)) return { label: "Approved", tone: "pay", rest: text };
  if (/^(Declined|Cancelled)\b/i.test(text)) return { label: text.split(/\W/)[0], tone: "block", rest: text };
  const message = text.match(/^Message \(([^)]*)\):\s*/);
  if (message) return { label: `Message · ${message[1]}`, tone: "quiet", rest: text.slice(message[0].length) };
  return { label: "Note", tone: "quiet", rest: text };
}

function AlertText({ text }: { text: string }) {
  const { label, tone, rest } = parseAlert(text);
  return (
    <>
      <Stamp tone={tone} size="sm" className="mb-1.5 mr-2">
        {label}
      </Stamp>
      <span className="block">{rest}</span>
    </>
  );
}

/** "R6 Over auto-pay limit: $4,800.00 is over…" -> the rule id, its name and the reason. */
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
    <article
      className={cn("overflow-hidden rounded-xl border bg-surface", cooling ? "border-hold/40" : "border-border-strong")}
      aria-labelledby={`payee-${item.caseId}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-6">
        <div className="min-w-0">
          <p className="font-mono text-[30px] font-medium leading-none tracking-[-0.03em] sm:text-[34px]">
            {item.amountCents != null ? formatCents(item.amountCents) : "Amount unknown"}
          </p>
          <p className="mt-2.5 text-[16px] font-medium" id={`payee-${item.caseId}`}>
            {item.vendorName ?? "Unknown payee"}
            {!item.vendorOnFile && <span className="font-normal text-hold-ink"> · not in your vendor book</span>}
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {item.invoiceNumber && `Invoice #${item.invoiceNumber} · `}
            {channelLabel(item.channel)} · {clockTime(item.createdAt)} · case <span className="font-mono">{item.ref}</span>
          </p>
        </div>
        <Stamp tone={cooling ? "hold" : "owner"}>{cooling ? "Cooling off" : "Needs your code"}</Stamp>
      </div>

      <div className="space-y-4 px-5 py-5 sm:px-6">
        {item.reasons.length > 0 && (
          <div>
            <p className="mb-2 font-mono text-[11.5px] font-medium uppercase tracking-[0.12em] text-owner-ink">Why it&apos;s waiting</p>
            <ul className="space-y-2 text-[13.5px] leading-relaxed text-muted-foreground">
              {item.reasons.map((r) => {
                const { id, name, text } = splitReason(r);
                return (
                  <li key={r} className="flex items-start gap-2.5">
                    {id && (
                      <Tag tone="code" title={ruleInfo(id)?.description} className="mt-px shrink-0 font-mono text-[11.5px]">
                        {id}
                      </Tag>
                    )}
                    <span>
                      {name && <b className="font-medium text-foreground">{name}. </b>}
                      {text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {cooling && (
          <div role="timer">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full bg-hold transition-[width] duration-1000 ease-linear" style={{ width: `${Math.max(0, Math.min(100, (coolLeft / coolTotal) * 100))}%` }} />
            </div>
            <p className="mt-2 font-mono text-[13px] text-hold-ink">Releases in {coolLeft}s. You can still cancel with a fresh code.</p>
          </div>
        )}

        <form className="space-y-3 border-t border-border pt-5" onSubmit={(e) => act(cooling ? "cancel" : "approve", e)}>
          <label htmlFor={codeId} className="block text-[13px] font-medium">
            Code from your authenticator app
          </label>
          <OtpInput id={codeId} length={OWNER_CODE.digits} value={code} onChange={setCode} describedBy={`help-${item.caseId}`} />
          <p className="text-[12.5px] text-muted-foreground" id={`help-${item.caseId}`}>
            {lockedFor > 0
              ? `Locked after too many wrong codes. Try again in ${lockedFor}s.`
              : !approval
                ? "Preparing the approval request…"
                : `${OWNER_CODE.digits} digits from the Countersign entry in your authenticator app. Each code works once.`}
          </p>
          {cooling ? (
            <button type="submit" className={buttonClass("danger", "h-11 w-full")} disabled={!ready}>
              Cancel payment
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" className={buttonClass("danger", "h-11")} disabled={!ready} onClick={() => act("decline")}>
                Decline
              </button>
              <button type="submit" className={buttonClass("approve", "h-11")} disabled={!ready}>
                Approve {item.amountCents != null ? formatCents(item.amountCents) : "payment"}
              </button>
            </div>
          )}
          <div aria-live="polite">
            {result && <p className={cn("rounded-lg px-3 py-2.5 text-[13.5px]", result.ok ? "bg-pay/10 text-pay-ink" : "bg-block/10 text-block-ink")}>{result.text}</p>}
          </div>
        </form>
      </div>
    </article>
  );
}
