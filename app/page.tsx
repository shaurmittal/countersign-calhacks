"use client";
// War Room (owner: P4). Spec §7.2. Everything shown here comes from real Convex rows; never animate fakes.
// A flight-strip board: the live case dominates the centre as one wide strip with its agent roster beneath;
// the bays on the right hold every recent case by state. Follows the newest case unless a strip is pinned.
import { useQuery } from "convex/react";
import { Radio } from "lucide-react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { AgentLanes } from "./components/AgentLanes";
import { AgentRoom } from "./components/AgentRoom";
import { AuditTrail } from "./components/AuditTrail";
import { DecisionCard } from "./components/DecisionCard";
import { useNow } from "./components/format";
import { CaseQueue } from "./components/Incoming";
import { Scoreboard } from "./components/Scoreboard";
import { AppShell } from "./ui/AppShell";
import { buttonClass, SectionHead } from "./ui/primitives";

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
  const following = pinnedId === null;

  return (
    <AppShell
      wide
      title="War Room"
      subtitle="Every request for money lands here as a strip. The agents check it in order; only the Policy Engine can clear it to pay."
      actions={
        <>
          {current && (
            <p className="mr-1 font-mono text-[12.5px] text-muted-foreground" aria-live="off">
              Case clock <span className="text-foreground">T+{clock}s</span>
            </p>
          )}
          {following ? (
            <span className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[13px] text-muted-foreground">
              <span className="live-dot" aria-hidden="true" />
              Following newest
            </span>
          ) : (
            <button type="button" className={buttonClass("ghost")} onClick={() => setPinnedId(null)}>
              <Radio className="size-4" aria-hidden="true" />
              Follow newest
            </button>
          )}
        </>
      }
    >
      <Scoreboard />

      {current ? (
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6">
            <DecisionCard c={current} detail={detail ?? undefined} />
            <section aria-label="The room" className="rounded-xl border border-border px-4 py-5 sm:px-6">
              <SectionHead title="How Countersign is handling it">
                <span>Live · only the Policy Engine can reach the Payer</span>
              </SectionHead>
              <AgentRoom c={current} detail={detail ?? undefined} />
            </section>
            <section aria-label="Agents" className="rounded-xl border border-border px-4 py-5 sm:px-6">
              <SectionHead title="Each step, with its evidence">
                <span>Fixed order · click a step for its evidence</span>
              </SectionHead>
              {detail ? (
                <AgentLanes detail={detail} closed={current.status === "CLOSED"} />
              ) : (
                <div className="space-y-3" aria-busy="true">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="skeleton h-9" />
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-6" aria-label="Board">
            <section>
              <SectionHead title="The board">
                <span className="font-mono">{cases?.length ?? 0} recent</span>
              </SectionHead>
              {cases && <CaseQueue cases={cases} selectedId={current._id} onSelect={setPinnedId} />}
            </section>
            <section>
              <SectionHead title="Audit chain for this case">
                <span>sha256, linked</span>
              </SectionHead>
              <AuditTrail caseId={current._id} />
            </section>
          </aside>
        </div>
      ) : (
        <EmptyBoard connecting={cases === undefined} />
      )}
    </AppShell>
  );
}

function EmptyBoard({ connecting }: { connecting: boolean }) {
  const email = process.env.NEXT_PUBLIC_EMAIL_ADDRESS;
  return (
    <section className="mt-6 grid min-h-[46vh] place-items-center rounded-xl border border-dashed border-border-strong px-6 py-16 text-center">
      <div className="max-w-md">
        <p className="mx-auto mb-5 flex w-fit items-center gap-2 text-[13px] text-muted-foreground">
          <span className="live-dot" aria-hidden="true" />
          {connecting ? "Connecting to the board…" : "Waiting for the first request"}
        </p>
        <h2 className="text-[26px] font-semibold tracking-[-0.02em]">Try to get money out of Lumen Labs.</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          Call <a href={`tel:${LINE.replace(/[^\d+]/g, "")}`} className="font-mono text-foreground">{LINE}</a>, type at{" "}
          <a href="/try" className="text-foreground underline underline-offset-4">/try</a>
          {email ? (
            <>
              , or email <span className="text-foreground">{email}</span>
            </>
          ) : null}
          . Your request appears here as a strip the moment it arrives.
        </p>
      </div>
    </section>
  );
}
