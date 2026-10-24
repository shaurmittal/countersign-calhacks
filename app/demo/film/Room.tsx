"use client";
// Scene II: the agents around the leader, the messages between them and the lock. A pure function of t.
import type { ReactNode } from "react";
import { RULES } from "../../../shared/policy/rules";
import type { RuleId } from "../../../shared/types";
import {
  AGENTS,
  DECISIONS,
  EDGES,
  FINDINGS,
  PACKETS,
  RULE_IDS,
  WORK,
  type AgentId,
  type AgentNode,
  type Finding,
  TIMES,
} from "./story";
import { ramp, window01 } from "./useFilm";

const W = 1000;
const H = 620;
const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });
const byId = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentNode>;

function working(t: number, id: AgentId) {
  return WORK.some((w) => w.agent === id && t >= w.start && t < w.end);
}
function finished(t: number, id: AgentId) {
  return WORK.some((w) => w.agent === id && t >= w.end);
}

export function Room({ t, compact }: { t: number; compact: boolean }) {
  const decision = [...DECISIONS].reverse().find((d) => t >= d.at) ?? null;
  return (
    <div className="lp-room" data-compact={compact || undefined}>
      <div className="lp-graph">
        <svg className="lp-room-wires" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <ellipse className="lp-orbit" cx={byId.leader.x} cy={byId.leader.y} rx={360} ry={215} />
          {EDGES.map(([a, b]) => {
            const A = byId[a];
            const B = byId[b];
            const hot = PACKETS.some(
              (p) => ((p.from === a && p.to === b) || (p.from === b && p.to === a)) && t >= p.start - 0.2 && t <= p.end + 0.4,
            );
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

        {PACKETS.map((p, i) => {
          const k = (t - p.start) / (p.end - p.start);
          if (k < 0 || k > 1.35) return null;
          const e = Math.min(1, k);
          const eased = e * e * (3 - 2 * e);
          const A = byId[p.from];
          const B = byId[p.to];
          const x = A.x + (B.x - A.x) * eased;
          const y = A.y + (B.y - A.y) * eased;
          const fade = k > 1 ? 1 - (k - 1) / 0.35 : Math.min(1, k * 4);
          return (
            <div key={i} className="lp-packet" style={{ ...pct(x, y), opacity: fade }}>
              <span className="lp-packet-dot" />
              <span className="lp-packet-label">{p.label}</span>
            </div>
          );
        })}

        {AGENTS.map((a) => (
          <Node key={a.id} a={a} t={t} />
        ))}
      </div>

      <div className="lp-casefile" aria-label="Case file">
        <p className="lp-casefile-title">Case file · …8gx7rm</p>
        {FINDINGS.map((f) => (
          <FindingCard key={f.agent} f={f} t={t} />
        ))}
        <LockPanel t={t} decision={decision} />
      </div>
    </div>
  );
}

function Node({ a, t }: { a: AgentNode; t: number }) {
  const busy = working(t, a.id);
  const done = finished(t, a.id);
  const blocked = a.id === "payer" && t >= DECISIONS[1].at;
  const state = busy ? "busy" : blocked ? "sealed" : done ? "done" : "idle";
  return (
    <div className={`lp-node lp-node-${a.kind} lp-node-${a.id}`} data-state={state} style={pct(a.x, a.y)}>
      <span className="lp-node-orb" aria-hidden="true">
        {busy && <span className="lp-node-ring" />}
        <Glyph id={a.id} />
      </span>
      <span className="lp-node-name">{a.name}</span>
      <span className="lp-node-tech">{a.tech}</span>
      {a.id === "callback" && t >= TIMES.dial && t < TIMES.outcome && (
        <span className="lp-node-status">{t < TIMES.connect ? "Ringing …9782" : "On the call"}</span>
      )}
      {a.id === "payer" && <span className="lp-node-status lp-money">{blocked ? "$0 moved · sealed" : "Never called"}</span>}
    </div>
  );
}

function FindingCard({ f, t }: { f: Finding; t: number }) {
  const o = window01(t, f.at, f.until ?? 999, 0.45);
  if (o <= 0) return null;
  return (
    <div className={`lp-finding lp-finding-${f.agent}`} style={{ opacity: o, transform: `translateY(${(1 - ramp(t, f.at, 0.5)) * 10}px)` }}>
      <p className="lp-finding-title">{f.title}</p>
      <ul>
        {f.lines.map((l, i) => (
          <li key={i} data-tone={l.tone} style={{ opacity: ramp(t, f.at + 0.15 + i * 0.22, 0.3) }}>
            {l.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LockPanel({ t, decision }: { t: number; decision: (typeof DECISIONS)[number] | null }) {
  // The engine checks every rule on each run; the scan is drawn over its work window.
  const runs = WORK.filter((w) => w.agent === "lock");
  const run = [...runs].reverse().find((w) => t >= w.start) ?? null;
  const scan = run ? ramp(t, run.start, Math.max(0.3, run.end - run.start)) : 0;
  const shown = window01(t, 25.6, TIMES.callbackScene, 0.4) + window01(t, 78.9, 999, 0.3);
  if (shown <= 0) return null;
  const fired = new Set<string>(decision && t >= decision.at ? decision.fired : []);
  return (
    <div className="lp-lockpanel" style={{ opacity: Math.min(1, shown) }} aria-label="Policy Engine rules">
      <p className="lp-lockpanel-title">
        The lock checks all 16 rules <span>· no AI</span>
      </p>
      <ol className="lp-rules">
        {RULE_IDS.map((id, i) => {
          const checked = scan * RULE_IDS.length > i;
          const isFired = fired.has(id);
          return (
            <li key={id} data-state={isFired ? "fired" : checked ? "checked" : "idle"} title={`${id} ${RULES[id as RuleId].name}`}>
              {id}
            </li>
          );
        })}
      </ol>
      {decision && t >= decision.at && (
        <p className="lp-verdict-chip" data-decision={decision.decision}>
          {decision.decision}
          <span>{decision.decision === "HOLD" ? "needs: a callback to the vendor" : "R10 · the vendor said no"}</span>
        </p>
      )}
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
