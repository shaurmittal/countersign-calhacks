"use client";
// Live numbers rail (spec §7.2). Numbers come from convex/scoreboard.ts; definitions in shared/scoreboard.ts.
// One hairline-ruled row: the board's columns never move, only their values roll.
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
    <section aria-label="Live numbers" className="grid grid-cols-2 border-y border-border sm:grid-cols-3 xl:grid-cols-6">
      <Metric label="Requests" value={score ? String(score.requests) : undefined} />
      <Metric label="Scam attempts stopped" value={score ? String(score.scamAttempts) : undefined} />
      {/* Green here is money protected; red if a scam ever got paid. */}
      <Metric label="Lost to scams" value={score ? formatCents(score.dollarsLostCents) : undefined} tone={score && score.dollarsLostCents === 0 ? "pay" : "block"} />
      <Metric label="Bills paid" value={score ? String(score.realBillsPaid) : undefined} note={score ? formatCents(score.dollarsPaidCents) : undefined} />
      <Metric label="Median decision" value={median != null ? seconds(median) : score ? "—" : undefined} />
      <Metric
        label="Audit chain"
        value={chain == null ? undefined : chain.ok ? "Verified" : `Broken at #${chain.brokenAtSeq}`}
        icon={chain == null ? undefined : chain.ok ? <Check className="size-[18px] stroke-[2.5]" aria-hidden="true" /> : <X className="size-[18px] text-block-ink" aria-hidden="true" />}
        tone={chain && !chain.ok ? "block" : undefined}
        note={chain?.ok ? `${chain.count.toLocaleString()} events` : undefined}
        text
      />
    </section>
  );
}

/** "0.2s" under ten seconds, "38s" above. */
function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

function Metric(props: { label: string; value: string | undefined; note?: ReactNode; tone?: "pay" | "block"; text?: boolean; icon?: ReactNode }) {
  return (
    <div className="-mb-px border-b border-border py-3 pr-4 sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:pl-5">
      <p className="text-[12.5px] text-muted-foreground">{props.label}</p>
      <p
        className={cn(
          "mt-1 flex flex-wrap items-baseline gap-x-2 font-mono text-[22px] leading-tight tracking-[-0.02em] sm:text-[24px]",
          props.tone === "pay" && "text-pay-ink",
          props.tone === "block" && "text-block-ink",
        )}
        aria-live="polite"
      >
        {props.value === undefined ? (
          <span className="skeleton inline-block h-[22px] w-16" />
        ) : props.text ? (
          <span className="flex items-center gap-1.5 self-center font-sans text-[19px] font-medium">
            {props.icon}
            {props.value}
          </span>
        ) : (
          <AnimatedNumber value={props.value} />
        )}
        {props.note && <span className="text-[13px] tracking-normal text-subtle">{props.note}</span>}
      </p>
    </div>
  );
}
