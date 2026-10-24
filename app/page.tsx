"use client";
// War Room (owner: P4). Spec §7.2. Everything shown here comes from real Convex rows; never animate fakes.
// Follows the newest case by default; click a case in the queue to pin it.
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { AgentLanes } from "./components/AgentLanes";
import { AuditTrail } from "./components/AuditTrail";
import { DecisionCard } from "./components/DecisionCard";
import { CaseQueue, Incoming } from "./components/Incoming";
import { Scoreboard } from "./components/Scoreboard";
import "./war-room.css";

const QUEUE_LENGTH = 12;

export default function WarRoom() {
  const cases = useQuery(api.cases.recent, { limit: QUEUE_LENGTH });
  const [pinnedId, setPinnedId] = useState<Id<"cases"> | null>(null);
  const current = cases?.find((c) => c._id === pinnedId) ?? cases?.[0];
  const detail = useQuery(api.warRoom.caseDetail, current ? { caseId: current._id } : "skip");

  return (
    <div className="war-room">
      <Scoreboard />
      <main className="grid">
        <div className="column">
          {current ? (
            <Incoming c={current} />
          ) : (
            <section className="panel">
              <h2>Incoming</h2>
              <p className="empty">{cases === undefined ? "Connecting…" : "Waiting for the first request…"}</p>
            </section>
          )}
          {cases && cases.length > 0 && (
            <CaseQueue
              cases={cases}
              selectedId={current?._id ?? null}
              following={pinnedId === null}
              onSelect={setPinnedId}
              onFollow={() => setPinnedId(null)}
            />
          )}
        </div>
        <section className="panel" aria-labelledby="agents-heading">
          <h2 id="agents-heading">Agents</h2>
          {detail ? <AgentLanes detail={detail} /> : <p className="empty">No case selected.</p>}
        </section>
        <div className="column">
          {current ? (
            <>
              <DecisionCard c={current} detail={detail ?? undefined} />
              <AuditTrail caseId={current._id} />
            </>
          ) : (
            <section className="panel">
              <h2>Decision</h2>
              <p className="empty">–</p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
