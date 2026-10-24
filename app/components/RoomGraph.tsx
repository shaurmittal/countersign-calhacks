"use client";
// The room from the demo film, drawn from live state instead of a timeline: the agents around the
// leader, the lock, and the payer. Presentational only; roomState.ts decides what each node shows.
import type { ReactNode } from "react";
import { AGENTS, EDGES, type AgentId, type AgentNode } from "../demo/film/story";
import "./room-graph.css";

export type NodeState = "idle" | "busy" | "done" | "sealed" | "failed" | "paid";
export type NodeChip = { text: string; money?: boolean };

const W = 1000;
const H = 620;
const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });
const byId = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentNode>;

export function RoomGraph({
  states,
  chips,
  hotEdges,
}: {
  states: Record<AgentId, NodeState>;
  chips?: Partial<Record<AgentId, NodeChip>>;
  hotEdges: ReadonlySet<string>;
}) {
  return (
    <div className="lp-graph wr-graph">
      <svg className="lp-room-wires" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <ellipse className="lp-orbit" cx={byId.leader.x} cy={byId.leader.y} rx={360} ry={215} />
        {EDGES.map(([a, b]) => {
          const A = byId[a];
          const B = byId[b];
          const hot = hotEdges.has(`${a}-${b}`);
          return (
            <line
              key={`${a}-${b}`}
              x1={A.x}
              y1={A.y}
              x2={B.x}
              y2={B.y}
              className={`lp-wire${b === "payer" ? " lp-wire-money" : ""}${hot ? " is-hot" : ""}`}
            />
          );
        })}
      </svg>

      {AGENTS.map((a) => (
        <Node key={a.id} a={a} state={states[a.id]} chip={chips?.[a.id]} />
      ))}
    </div>
  );
}

function Node({ a, state, chip }: { a: AgentNode; state: NodeState; chip: NodeChip | undefined }) {
  return (
    <div
      className={`lp-node lp-node-${a.kind} lp-node-${a.id}`}
      data-state={state}
      style={pct(a.x, a.y)}
      role="group"
      aria-label={`${a.name}: ${state}${chip ? ", " + chip.text : ""}`}
    >
      <span className="lp-node-orb" aria-hidden="true">
        {state === "busy" && <span className="lp-node-ring" />}
        <Glyph id={a.id} />
      </span>
      <span className="lp-node-name">{a.name}</span>
      <span className="lp-node-tech">{a.tech}</span>
      {chip && <span className={`lp-node-status${chip.money ? " lp-money" : ""}`}>{chip.text}</span>}
    </div>
  );
}

function Glyph({ id }: { id: AgentId }): ReactNode {
  const common = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "leader":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <circle cx="12" cy="12" r="7.5" strokeDasharray="2.5 2.5" />
        </svg>
      );
    case "intake":
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M10 11h5M10 14.5h5M10 18h3" />
        </svg>
      );
    case "verifier":
      return (
        <svg {...common}>
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="M15 15l5 5" />
        </svg>
      );
    case "risk":
      return (
        <svg {...common}>
          <path d="M4 16a8 8 0 0 1 16 0" />
          <path d="M12 16l4-5" />
        </svg>
      );
    case "callback":
      return (
        <svg {...common}>
          <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
        </svg>
      );
    case "owner":
      return (
        <svg {...common}>
          <circle cx="8" cy="12" r="3.5" />
          <path d="M11.5 12H21M17 12v3M20 12v2" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="5" y="10.5" width="14" height="10" rx="2" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "payer":
      return (
        <svg {...common}>
          <path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.7 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" />
        </svg>
      );
  }
}
