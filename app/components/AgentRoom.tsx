"use client";
// The room, live: the agents around the leader, the Policy Engine below them, and the Payer that only the
// Policy Engine can reach. The same geometry as the /demo film, redrawn in the app's OLED system and fed by
// this case's real rows (roomState.ts): a wire carries a pulse while the agent at its end is working, each
// node settles into its state, and a caption says what is happening now. Nothing moves unless a row changes.
import { motion, useReducedMotion } from "framer-motion";
import { Check, Lock, X } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { Decision, PolicyResult } from "../../shared/types";
import { AGENTS, EDGES, type AgentId, type AgentNode } from "../demo/film/story";
import { cn } from "../ui/cn";
import { spring } from "../ui/motion";
import { decisionTone } from "../ui/primitives";
import type { CaseDetail } from "./AgentLanes";
import type { CaseRow } from "./DecisionCard";
import { useNow } from "./format";
import { deriveRoom } from "./roomState";

export type NodeState = "idle" | "busy" | "done" | "sealed" | "failed" | "paid";
export type NodeChip = { text: string; money?: boolean };

const W = 1000;
const H = 620;
const byId = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentNode>;

/** What each agent is doing while its wire is lit, for the "now" caption. */
const DOING: Record<AgentId, string> = {
  leader: "Countersign is running the case",
  intake: "Intake Parser is reading the request (Claude, treating it as untrusted)",
  verifier: "Vendor Verifier is checking the vendor book, sender, bank and invoice",
  risk: "Risk Analyst is scoring the red flags",
  callback: "Callback Verifier is phoning the vendor on the number already on file",
  owner: "Owner Concierge is waiting for Priya's authenticator code",
  lock: "The Policy Engine is deciding, in plain code",
  payer: "The Payer is sending one countersigned transfer",
};

export function AgentRoom({ c, detail }: { c: CaseRow; detail: CaseDetail | undefined }) {
  const now = useNow(1000);
  const room = useMemo(() => deriveRoom(c, detail, now), [c, detail, now]);
  const decision: Decision | undefined = c.decision ?? (c.policyResult as PolicyResult | undefined)?.decision;
  const caption = nowCaption(room.states, c, decision);

  return (
    <div>
      {/* The graph needs room to breathe; on phones the caption and the step list below carry the story. */}
      <div className="relative mb-24 hidden aspect-[1000/620] w-full sm:block">
        <svg className="absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <ellipse cx={byId.leader.x} cy={byId.leader.y} rx={360} ry={215} className="room-orbit" />
          {EDGES.map(([a, b]) => {
            const A = byId[a];
            const B = byId[b];
            const hot = room.hotEdges.has(`${a}-${b}`);
            const money = b === "payer";
            return (
              <g key={`${a}-${b}`}>
                <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} className={cn("room-wire", hot && "is-hot", money && "is-money", money && room.states.payer === "paid" && "is-paid")} />
                {hot && <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} pathLength={100} className={cn("room-pulse", money && "is-money")} />}
              </g>
            );
          })}
        </svg>
        {AGENTS.map((a) => (
          <Node key={a.id} a={a} state={room.states[a.id]} chip={room.chips[a.id]} decision={a.id === "lock" ? decision : undefined} />
        ))}
      </div>
      <p className="flex min-h-6 items-start gap-2.5 text-[14px] leading-snug text-foreground/90" role="status" aria-live="polite">
        <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", caption.live ? "bg-foreground animate-pulse" : "bg-white/30")} aria-hidden="true" />
        <motion.span key={caption.text} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
          {caption.text}
        </motion.span>
      </p>
    </div>
  );
}

function nowCaption(states: Record<AgentId, NodeState>, c: CaseRow, decision: Decision | undefined): { text: string; live: boolean } {
  // The node furthest along the path that is working right now.
  const order: AgentId[] = ["payer", "owner", "callback", "lock", "risk", "verifier", "intake"];
  const busy = order.find((id) => states[id] === "busy");
  if (busy) return { text: `${DOING[busy]}…`, live: true };
  if (c.status === "CLOSED") {
    if (states.payer === "paid") return { text: "Paid. The Policy Engine's PAY was the only key that could reach the Payer.", live: false };
    if (states.payer === "failed") return { text: `${decision ?? "Closed"}. The Payer tried and the bank refused the transfer: $0 moved.`, live: false };
    if (decision === "NO_ACTION") return { text: "Not a payment. The Payer was never called.", live: false };
    return { text: `${decision ?? "Closed"}. The Payer was never reached: $0 moved.`, live: false };
  }
  if (c.status === "CALLBACK_PENDING") return { text: `${DOING.callback}…`, live: true };
  if (c.status === "AWAITING_OWNER") return { text: `${DOING.owner}…`, live: true };
  return { text: "Countersign is running the case…", live: true };
}

function Node({ a, state, chip, decision }: { a: AgentNode; state: NodeState; chip: NodeChip | undefined; decision?: Decision }) {
  const reduce = useReducedMotion();
  const code = a.kind === "code";
  const leader = a.id === "leader";
  const tone = decision && state === "done" ? decisionTone(decision) : null;
  return (
    <div
      className="absolute flex w-[120px] -translate-x-1/2 -translate-y-[28px] flex-col items-center gap-1 text-center lg:w-[176px]"
      style={{ left: `${(a.x / W) * 100}%`, top: `${(a.y / H) * 100}%` }}
      role="group"
      aria-label={`${a.name}: ${state}${chip ? `, ${chip.text}` : ""}`}
    >
      <motion.span
        animate={state === "busy" && !reduce ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        transition={state === "busy" ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : spring.smooth}
        className={cn(
          "relative grid size-11 place-items-center border bg-background transition-colors duration-300 sm:size-14",
          code ? "rounded-xl" : "rounded-full",
          leader && "size-13 sm:size-[68px]",
          state === "idle" && "border-white/15 text-white/35",
          state === "busy" && "border-foreground text-foreground shadow-[0_0_0_4px_rgba(255,255,255,0.06)]",
          state === "done" && !tone && "border-white/40 text-foreground",
          state === "failed" && "border-block/70 text-block-ink",
          state === "paid" && "border-pay/70 text-pay-ink shadow-[0_0_0_4px_rgba(34,197,94,0.1)]",
          state === "sealed" && "border-white/30 text-muted-foreground",
          tone === "pay" && "border-pay/70 text-pay-ink",
          tone === "block" && "border-block/70 text-block-ink",
          tone === "hold" && "border-hold/60 text-hold-ink",
          tone === "owner" && "border-foreground text-foreground",
          tone === "quiet" && "border-white/40 text-muted-foreground",
        )}
      >
        {state === "busy" && !reduce && (
          <span className={cn("absolute -inset-1.5 border border-white/50 room-ring", code ? "rounded-2xl" : "rounded-full")} aria-hidden="true" />
        )}
        <Glyph id={a.id} />
        {state === "done" && !leader && !code && (
          <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-foreground text-background sm:size-[18px]" aria-hidden="true">
            <Check className="size-2.5 stroke-[3] sm:size-3" />
          </span>
        )}
        {state === "failed" && (
          <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-block text-white sm:size-[18px]" aria-hidden="true">
            <X className="size-2.5 stroke-[3] sm:size-3" />
          </span>
        )}
        {state === "sealed" && (
          <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-surface-3 text-foreground sm:size-[18px]" aria-hidden="true">
            <Lock className="size-2.5 stroke-[2.5] sm:size-3" />
          </span>
        )}
      </motion.span>
      <span className={cn("rounded bg-background px-1.5 text-[13.5px] font-medium leading-tight", state === "idle" ? "text-white/45" : "text-foreground")}>{a.name}</span>
      <span className="hidden rounded bg-background px-1.5 font-mono text-[11.5px] leading-tight text-subtle lg:block">{a.tech}</span>
      {chip && (
        <motion.span
          key={chip.text}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.smooth}
          className={cn(
            "mt-0.5 hidden whitespace-nowrap rounded-md border px-2 py-0.5 font-mono text-[11.5px] sm:block",
            chip.money && state === "paid" ? "border-pay/40 bg-pay/10 text-pay-ink" : chip.money && state === "failed" ? "border-block/40 bg-block/10 text-block-ink" : "border-border-strong bg-background text-muted-foreground",
          )}
        >
          {chip.text}
        </motion.span>
      )}
    </div>
  );
}

function Glyph({ id }: { id: AgentId }): ReactNode {
  const common = { className: "size-[18px] sm:size-[22px]", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
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
