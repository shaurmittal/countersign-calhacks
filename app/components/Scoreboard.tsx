"use client";
// Live numbers rail (spec §7.2). Numbers come from convex/scoreboard.ts; definitions in shared/scoreboard.ts.
// One hairline-ruled row: the board's columns never move, only their values roll.
import { useQuery } from "convex/react";
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
    <section aria-label="Live numbers" className="grid grid-cols-2 overflow-hidden rounded-xl border border-border sm:grid-cols-3 xl:grid-cols-6">
      <Metric label="Requests" value={score ? String(score.requests) : undefined} />
      <Metric label="Scam attempts stopped" value={score ? String(score.scamAttempts) : undefined} />
      <Metric label="Lost to scams" value={score ? formatCents(score.dollarsLostCents) : undefined} tone={score && score.dollarsLostCents === 0 ? "pay" : "block"} />
      <Metric
        label="Bills paid"
        value={score ? String(score.realBillsPaid) : undefined}
        note={score ? formatCents(score.dollarsPaidCents) : undefined}
      />
      <Metric label="Median decision" value={median != null ? seconds(median) : score ? "—" : undefined} />
      <Metric
        label="Audit chain"
        value={chain == null ? undefined : chain.ok ? "Verified" : `Broken #${chain.brokenAtSeq}`}
        tone={chain == null ? undefined : chain.ok ? "pay" : "block"}
        note={chain?.ok ? `${chain.count.toLocaleString()} events re-hashed` : undefined}
        text
      />
    </section>
  );
}

/** "0.2s" under ten seconds, "38s" above. */
function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

function Metric(props: { label: string; value: string | undefined; note?: ReactNode; tone?: "pay" | "block"; text?: boolean }) {
  return (
    <div className="-mb-px -mr-px border-b border-r border-border px-4 py-3.5 sm:px-5 sm:py-4">
      <p className="text-[12px] text-muted-foreground">{props.label}</p>
      <p
        className={cn(
          "mt-1.5 flex items-center gap-2 text-[22px] font-medium leading-none tracking-[-0.02em] sm:text-[24px]",
          props.tone === "pay" && "text-pay-ink",
          props.tone === "block" && "text-block-ink",
        )}
        aria-live="polite"
      >
        {props.value === undefined ? (
          <span className="skeleton inline-block h-[22px] w-16" />
        ) : props.text ? (
          <>
            <span className={cn("size-2 rounded-full", props.tone === "pay" ? "bg-pay" : "bg-block")} aria-hidden="true" />
            <span className="text-[18px] sm:text-[19px]">{props.value}</span>
          </>
        ) : (
          <AnimatedNumber value={props.value} className="font-sans" />
        )}
      </p>
      {props.note && <p className="mt-1.5 font-mono text-[11.5px] text-subtle">{props.note}</p>}
    </div>
  );
}
