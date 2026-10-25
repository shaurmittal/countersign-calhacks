"use client";
// Owner approvals (owner: P4). Spec §6.5. The owner opens this on their phone. Approve, decline
// or cancel each need a code from the Countersign entry in their authenticator app; the code is
// checked server-side (convex/agents/ownerConcierge.ts). This page holds no secrets.
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Clock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { OWNER_CODE } from "../../shared/config";
import { formatCents } from "../../shared/ledger";
import { AppShell } from "../ui/AppShell";
import { cn } from "../ui/cn";
import { OtpInput } from "../ui/OtpInput";
import { buttonClass, SectionHead, Stamp, Tag } from "../ui/primitives";
import { channelLabel, clockTime, ruleInfo, secondsLeft, useNow } from "../components/format";
import { BankChangesSection } from "./BankChangesSection";
import { ListsSection } from "./ListsSection";

type Pending = FunctionReturnType<typeof api.owner.pending>[number];
type OwnerAction = "approve" | "decline" | "cancel";

export default function OwnerPage() {
  const pending = useQuery(api.owner.pending);
  const feed = useQuery(api.owner.feed);
  const changes = useQuery(api.bank.pendingChanges);

  return (
    <AppShell
      title="Approvals"
      subtitle="Known bills are paid on their own. Anything new or unusual waits here for Priya's authenticator code. A voice, a text or an email never counts."
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
          <ListsSection />
        </div>

        <aside aria-labelledby="alerts-title" className="lg:sticky lg:top-6 lg:self-start">
          <SectionHead title={<span id="alerts-title">Alerts</span>} />
          {feed && feed.length > 0 ? (
            <ol className="max-h-[72vh] space-y-px overflow-y-auto rounded-xl border border-border bg-border">
              {feed.map((f) => (
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
          <p className="mt-6 text-[12px] leading-relaxed text-subtle">
            Countersign will never ask for your code by phone, text or email. Enter it only on this page or in your own ASI:One
            chat with Countersign.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}

/** "BLOCK (R1): …" -> a stamp and the sentence. */
function AlertText({ text }: { text: string }) {
  const m = text.match(/^(PAY|BLOCK|HOLD|ESCALATE)\s*(\([^)]*\))?:\s*([\s\S]*)$/);
  if (!m) return <>{text}</>;
  const tone = m[1] === "PAY" ? "pay" : m[1] === "BLOCK" ? "block" : m[1] === "HOLD" ? "hold" : "owner";
  return (
    <>
      <Stamp tone={tone} size="sm" className="mr-2 align-[1px]">
        {m[1]}
      </Stamp>
      {m[3]}
    </>
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
        {item.firedRules.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.firedRules.map((id) => (
              <Tag key={id} title={ruleInfo(id)?.description}>
                <b className="font-mono font-medium">{id}</b> {ruleInfo(id)?.name ?? "rule"}
              </Tag>
            ))}
          </div>
        )}
        {item.reasons.length > 0 && (
          <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
            {item.reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="mt-[9px] size-1 shrink-0 rounded-full bg-white/30" aria-hidden="true" />
                {r}
              </li>
            ))}
          </ul>
        )}
        {cooling && (
          <p className="flex items-center gap-2 font-mono text-[14px] text-hold-ink" role="timer">
            <Clock className="size-4" aria-hidden="true" />
            Approved. Releases in {secondsLeft(approval!.coolingOffUntil!, now)}s. You can still cancel.
          </p>
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
                : `${OWNER_CODE.digits} digits from the Countersign entry. Codes change every ${OWNER_CODE.periodSeconds} seconds.`}
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
                Approve payment
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
