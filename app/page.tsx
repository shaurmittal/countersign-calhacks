"use client";
// War Room (owner: P4). Spec §7.2. Everything shown here comes from real Convex rows; never animate fakes.
// Built for a projector: the live numbers, the case tabs and the case clock across the top; the agent room
// with the request and Countersign's reply under it on the left; the verdict and what each agent found on
// the right; the case's audit chain along the bottom. Follows the newest case unless a tab is pinned.
import { useQuery } from "convex/react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { AgentLanes } from "./components/AgentLanes";
import { AgentRoom } from "./components/AgentRoom";
import { AuditTrail } from "./components/AuditTrail";
import { DecisionCard } from "./components/DecisionCard";
import { useNow } from "./components/format";
import { CaseQueue, IncomingMessage } from "./components/Incoming";
import { Scoreboard } from "./components/Scoreboard";
import { StageShell } from "./ui/AppShell";

const QUEUE_LENGTH = 12;
const CLOCK_TICK_MS = 100;
const LINE = "+1 (256) 215-6932";

export default function WarRoom() {
  const cases = useQuery(api.cases.recent, { limit: QUEUE_LENGTH });
  const [pinnedId, setPinnedId] = useState<Id<"cases"> | null>(null);
  const current = cases?.find((c) => c._id === pinnedId) ?? cases?.[0];
  const detail = useQuery(api.warRoom.caseDetail, current ? { caseId: current._id } : "skip");
  const now = useNow(CLOCK_TICK_MS);
  const clockEnd = current ? (current.status === "CLOSED" ? current.updatedAt : now) : null;
  const clock = current && clockEnd !== null ? (Math.max(0, clockEnd - current.createdAt) / 1000).toFixed(1) : null;

  return (
    <StageShell>
      <h1 className="sr-only">Countersign War Room</h1>
      <Scoreboard />

      <main className="mt-2.5 rounded-2xl border border-border" aria-label="Live payment requests">
        <div className="flex items-center gap-4 border-b border-border px-3 py-1.5 sm:px-4">
          <div className="min-w-0 flex-1">
            {cases && cases.length > 0 ? (
              <CaseQueue cases={cases} selectedId={current?._id ?? null} following={pinnedId === null} onSelect={setPinnedId} onFollow={() => setPinnedId(null)} />
            ) : (
              <p className="px-2 text-[14px] text-muted-foreground">{cases === undefined ? "Connecting…" : "No requests yet"}</p>
            )}
          </div>
          <ScamTypeFilter />
          <p className="shrink-0 text-right font-mono" aria-live="off">
            <span className="block text-[11px] uppercase tracking-[0.12em] text-subtle">Case clock · real time</span>
            <span className="block text-[18px] font-medium leading-tight tracking-[-0.02em] text-foreground">{clock ? `T+${clock}s` : "—"}</span>
          </p>
        </div>

        {current ? (
          <>
            <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,1fr)]">
              <section aria-label="The room" className="min-w-0">
                <AgentRoom c={current} detail={detail ?? undefined} />
              </section>
              <div className="min-w-0 space-y-2.5">
                <IncomingMessage c={current} />
                <DecisionCard c={current} detail={detail ?? undefined} />
                {detail ? (
                  <AgentLanes detail={detail} />
                ) : (
                  <div className="space-y-3" aria-busy="true">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="skeleton h-28 rounded-xl" />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-3 pb-3 sm:px-4 sm:pb-4">
              <AuditTrail caseId={current._id} />
            </div>
          </>
        ) : (
          <EmptyBoard connecting={cases === undefined} />
        )}
      </main>
    </StageShell>
  );
}

/**
 * What Countersign watches for. Only payment fraud is live; the rest are on the roadmap and can't be
 * picked, so the menu never suggests a filter that isn't real.
 */
const SCAM_TYPES = [
  "Account takeover & password resets",
  "Payroll & direct-deposit changes",
  "Tech-support & remote-access scams",
  "Government & tax impersonation",
  "Fake refunds & chargebacks",
];

function ScamTypeFilter() {
  return (
    <label className="hidden shrink-0 items-center gap-2 sm:flex">
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">Protecting against</span>
      <span className="relative block">
        <select
          defaultValue="payments"
          className="h-8 w-[220px] appearance-none truncate rounded-lg border border-border-strong bg-background pl-2.5 pr-8 text-[13px] text-foreground outline-none transition-colors focus:border-foreground"
        >
          <option value="payments">Payment & invoice fraud · live</option>
          {SCAM_TYPES.map((t) => (
            <option key={t} value={t} disabled>
              {t} · coming soon
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      </span>
    </label>
  );
}

function EmptyBoard({ connecting }: { connecting: boolean }) {
  const email = process.env.NEXT_PUBLIC_EMAIL_ADDRESS;
  return (
    <section className="grid min-h-[56vh] place-items-center px-6 py-16 text-center">
      <div className="max-w-lg">
        <p className="mx-auto mb-5 flex w-fit items-center gap-2 text-[14px] text-muted-foreground">
          <span className="live-dot" aria-hidden="true" />
          {connecting ? "Connecting to the room…" : "Waiting for the first request"}
        </p>
        <h2 className="text-[26px] font-semibold tracking-[-0.02em]">Try to get money out of Lumen Labs.</h2>
        <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
          Call <a href={`tel:${LINE.replace(/[^\d+]/g, "")}`} className="font-mono text-foreground">{LINE}</a>, type at{" "}
          <a href="/try" className="text-foreground underline underline-offset-4">/try</a>
          {email ? (
            <>
              , or email <span className="text-foreground">{email}</span>
            </>
          ) : null}
          . Watch every agent work on it here, live.
        </p>
      </div>
    </section>
  );
}
