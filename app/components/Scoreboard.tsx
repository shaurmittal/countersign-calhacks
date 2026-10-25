"use client";
// Live numbers strip (spec §7.2). Numbers come from convex/scoreboard.ts; definitions in shared/scoreboard.ts.
// One line a room can read from the back: each value rolls when a real row changes it.
import { useQuery } from "convex/react";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { formatCents } from "../../shared/ledger";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { cn } from "../ui/cn";

export function Scoreboard() {
  const score = useQuery(api.scoreboard.get);
  const chain = useQuery(api.audit.verifyChain);
  const median = score?.medianDecisionMs;

  return (
    <section aria-label="Live numbers" className="flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-xl border border-border bg-surface px-4 py-2 sm:px-5">
      <p className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.14em] text-accent">
        <span className="live-dot" aria-hidden="true" /> Live
      </p>
      <Metric value={score ? String(score.requests) : undefined} label="requests" />
      <Metric value={score ? String(score.scamAttempts) : undefined} label="scam attempts stopped" />
      {/* Green here is money protected; red if a scam ever got paid. */}
      <Metric value={score ? formatCents(score.dollarsLostCents) : undefined} label="lost to scams" tone={score && score.dollarsLostCents === 0 ? "pay" : "block"} />
      <Metric value={score ? String(score.realBillsPaid) : undefined} label="bills paid" extra={score ? formatCents(score.dollarsPaidCents) : undefined} />
      <Metric value={median != null ? seconds(median) : score ? "—" : undefined} label="median decision" />
      <p className="ml-auto flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em]" role="status" aria-live="polite">
        {chain == null ? (
          <span className="text-subtle">Checking audit chain…</span>
        ) : chain.ok ? (
          <>
            <Check className="size-3.5 stroke-[2.5] text-code" aria-hidden="true" />
            <span className="text-code-ink">Audit chain verified</span>
            <span className="text-subtle">· {chain.count.toLocaleString()} events</span>
          </>
        ) : (
          <>
            <X className="size-3.5 text-block-ink" aria-hidden="true" />
            <span className="text-block-ink">Audit chain broken at #{chain.brokenAtSeq}</span>
          </>
        )}
      </p>
    </section>
  );
}

/** "0.2s" under ten seconds, "38s" above. */
function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

function Metric(props: { value: string | undefined; label: string; extra?: ReactNode; tone?: "pay" | "block" }) {
  return (
    <p className="flex items-baseline gap-2" aria-live="polite">
      <span className={cn("font-mono text-[19px] font-medium leading-none tracking-[-0.02em]", props.tone === "pay" && "text-pay-ink", props.tone === "block" && "text-block-ink")}>
        {props.value === undefined ? <span className="skeleton inline-block h-5 w-10 align-middle" /> : <AnimatedNumber value={props.value} />}
      </span>
      {props.extra && <span className="font-mono text-[13px] text-muted-foreground">{props.extra}</span>}
      <span className="text-[13px] text-muted-foreground">{props.label}</span>
    </p>
  );
}
