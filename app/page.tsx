"use client";
// War Room (owner: P4). Spec §7.2. Everything shown here comes from real Convex rows; never animate fakes.
// Follows the newest case by default; click a case in the queue to pin it.
// Styled with the /demo landing page's stylesheet so the live room and the replay look like one film.
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { AgentLanes } from "./components/AgentLanes";
import { AuditTrail } from "./components/AuditTrail";
import { DecisionCard } from "./components/DecisionCard";
import { useNow } from "./components/format";
import { CaseQueue, Incoming } from "./components/Incoming";
import { Nav } from "./components/Nav";
import { RoomStage } from "./components/RoomStage";
import { Scoreboard } from "./components/Scoreboard";
import "./demo/landing.css";
import "./war-room.css";

const QUEUE_LENGTH = 12;
const CLOCK_TICK_MS = 100;

export default function WarRoom() {
  const cases = useQuery(api.cases.recent, { limit: QUEUE_LENGTH });
  const [pinnedId, setPinnedId] = useState<Id<"cases"> | null>(null);
  const current = cases?.find((c) => c._id === pinnedId) ?? cases?.[0];
  const detail = useQuery(api.warRoom.caseDetail, current ? { caseId: current._id } : "skip");
  const now = useNow(CLOCK_TICK_MS);
  const clockEnd = current ? (current.status === "CLOSED" ? current.updatedAt : now) : null;
  const clock = current && clockEnd !== null ? (Math.max(0, clockEnd - current.createdAt) / 1000).toFixed(1) : null;

  return (
    <div className="lp wr-root">
      <div className="lp-grain" aria-hidden="true" />
      <Nav />
      <Scoreboard />
      <main className="lp-film wr-frame" aria-label="Live payment requests">
        <div className="lp-film-bar wr-bar">
          {cases && cases.length > 0 ? (
            <CaseQueue
              cases={cases}
              selectedId={current?._id ?? null}
              following={pinnedId === null}
              onSelect={setPinnedId}
              onFollow={() => setPinnedId(null)}
            />
          ) : (
            <p className="wr-empty-tabs">{cases === undefined ? "Connecting…" : "No requests yet"}</p>
          )}
          <p className="lp-caseclock" aria-live="off">
            {current ? (
              <>
                <span>Case clock · real time</span> <b>T+{clock}s</b>
              </>
            ) : (
              <>
                <span>Case clock</span> <b>waiting for the request</b>
              </>
            )}
          </p>
        </div>
        <div className="wr-stage">
          {current ? (
            <>
              <section className="wr-graph-cell" aria-label="Agents">
                <RoomStage c={current} detail={detail ?? undefined} />
              </section>
              <section className="wr-casefile" aria-label="Case file">
                <DecisionCard c={current} detail={detail ?? undefined} />
                {detail ? <AgentLanes detail={detail} /> : <p className="wr-muted">Loading case file…</p>}
              </section>
              <Incoming c={current} />
            </>
          ) : (
            <div className="lp-poster wr-poster">
              <p className="lp-poster-main">
                <span className="lp-live-dot" aria-hidden="true" />
                <span>
                  {cases === undefined ? "Connecting…" : "Waiting for the first request…"}
                  <small>Call +1 (256) 215-6932 · or type at /try</small>
                </span>
              </p>
            </div>
          )}
        </div>
        <div className="wr-foot">{current ? <AuditTrail caseId={current._id} /> : null}</div>
      </main>
    </div>
  );
}
