"use client";
// The room, live: the agents around Countersign (the leader), the Policy Engine below them, and the Payer
// that only the Policy Engine can reach. The /demo film's formation with more air between the rows, drawn
// in the app's OLED system and fed by this case's real rows (roomState.ts): a wire lights and carries a
// travelling dot while the agent at its end works, finished agents get a check, the Policy Engine takes
// the verdict's colour, and the Payer turns green only on a real payment. Nothing moves unless a row changes.
import { motion, useReducedMotion } from "framer-motion";
import { Check, Lock, X } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { Decision, PolicyResult } from "../../shared/types";
import type { AgentId } from "../demo/film/story";
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
const H = 870; // extra room under the Payer for its labels and chip

type Node = { id: AgentId; name: string; tech: string; x: number; y: number; kind: "ai" | "code" | "money" | "leader" };

// Same formation as the film (app/demo/film/story.ts), stretched vertically so no label meets the next node.
const NODES: Node[] = [
  { id: "leader", name: "Countersign", tech: "The leader · runs the case", x: 500, y: 300, kind: "leader" },
  { id: "intake", name: "Intake Parser", tech: "Claude · reads untrusted text", x: 140, y: 200, kind: "ai" },
  { id: "verifier", name: "Vendor Verifier", tech: "Vendor book · Moss · CRS", x: 330, y: 70, kind: "ai" },
  { id: "risk", name: "Risk Analyst", tech: "Rules + Claude", x: 670, y: 70, kind: "ai" },
  { id: "callback", name: "Callback Verifier", tech: "Cartesia voice agent", x: 860, y: 200, kind: "ai" },
  { id: "owner", name: "Owner Concierge", tech: "Authenticator code · ASI:One", x: 860, y: 470, kind: "ai" },
  { id: "lock", name: "Policy Engine", tech: "Plain code · no AI", x: 500, y: 500, kind: "code" },
  { id: "payer", name: "Payer", tech: "Only the Policy Engine can reach it", x: 500, y: 680, kind: "money" },
];
const byId = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<AgentId, Node>;
const EDGES: [AgentId, AgentId][] = [
  ["leader", "intake"],
  ["leader", "verifier"],
  ["leader", "risk"],
  ["leader", "callback"],
  ["leader", "owner"],
  ["leader", "lock"],
  ["lock", "payer"],
];

/** What each agent is doing while its wire is lit, for the caption. */
const DOING: Record<AgentId, string> = {
  leader: "Countersign is running the case",
  intake: "The Intake Parser is reading the request (Claude, treating it as untrusted)",
  verifier: "The Vendor Verifier is checking the vendor book, the sender, the bank details and the invoice",
  risk: "The Risk Analyst is scoring the red flags",
  callback: "The Callback Verifier is phoning the vendor on the number already on file",
  owner: "The Owner Concierge is waiting for Priya's authenticator code",
  lock: "The Policy Engine is deciding, in plain code",
  payer: "The Payer is sending one countersigned transfer",
};

export function AgentRoom({ c, detail }: { c: CaseRow; detail: CaseDetail | undefined }) {
  const now = useNow(1000);
  const reduce = useReducedMotion();
  const room = useMemo(() => deriveRoom(c, detail, now), [c, detail, now]);
  const decision: Decision | undefined = c.decision ?? (c.policyResult as PolicyResult | undefined)?.decision;
  const caption = nowCaption(room.states, c, decision);

  return (
    <div>
      <div className="relative mx-auto hidden aspect-[1000/870] w-full max-w-[900px] md:block">
        <div className="room-glow pointer-events-none absolute aspect-square w-[60%] -translate-x-1/2 -translate-y-1/2" style={{ left: "50%", top: `${(byId.leader.y / H) * 100}%` }} aria-hidden="true" />
        <svg className="absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <ellipse cx={byId.leader.x} cy={byId.leader.y + 20} rx={400} ry={250} className="room-orbit" />
          {EDGES.map(([a, b]) => {
            const A = byId[a];
            const B = byId[b];
            const hot = room.hotEdges.has(`${a}-${b}`);
            const money = b === "payer";
            const paid = money && room.states.payer === "paid";
            const d = `M ${A.x} ${A.y} L ${B.x} ${B.y}`;
            return (
              <g key={`${a}-${b}`}>
                <path d={d} className={cn("room-wire", hot && "is-hot", money && "is-money", paid && "is-paid")} />
                {hot && !reduce && (
                  <circle r={6} className={money ? "fill-pay-ink" : "fill-accent-ink"} style={{ filter: "drop-shadow(0 0 6px rgba(242,176,76,0.9))" }}>
                    <animateMotion dur="1.4s" repeatCount="indefinite" path={d} />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>
        {NODES.map((n) => (
          <RoomNode key={n.id} n={n} state={room.states[n.id]} chip={room.chips[n.id]} decision={n.id === "lock" ? decision : undefined} />
        ))}
      </div>

      <p className="mx-auto mt-2 flex max-w-[900px] items-start gap-3 text-[16px] leading-snug text-foreground sm:text-[17px]" role="status" aria-live="polite">
        <span className={cn("mt-2 size-2 shrink-0 rounded-full", caption.live ? "animate-pulse bg-accent shadow-[0_0_10px_rgba(242,176,76,0.7)]" : "bg-white/30")} aria-hidden="true" />
        <motion.span key={caption.text} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
          {caption.text}
        </motion.span>
      </p>
    </div>
  );
}

function nowCaption(states: Record<AgentId, NodeState>, c: CaseRow, decision: Decision | undefined): { text: string; live: boolean } {
  const order: AgentId[] = ["payer", "owner", "callback", "lock", "risk", "verifier", "intake"];
  const busy = order.find((id) => states[id] === "busy");
  if (busy) return { text: `${DOING[busy]}…`, live: true };
  if (c.status === "CLOSED") {
    if (states.payer === "paid") return { text: "Paid. The Policy Engine's PAY was the only key that could reach the Payer.", live: false };
    if (states.payer === "failed") return { text: `${decision ?? "Closed"}. The Payer tried and the bank refused the transfer: $0 moved.`, live: false };
    if (decision === "NO_ACTION") return { text: "Not a payment, so the Payer was never called.", live: false };
    return { text: `${decision ?? "Closed"}. The Payer was never reached: $0 moved.`, live: false };
  }
  if (c.status === "CALLBACK_PENDING") return { text: `${DOING.callback}…`, live: true };
  if (c.status === "AWAITING_OWNER") return { text: `${DOING.owner}…`, live: true };
  return { text: "Countersign is running the case…", live: true };
}

function RoomNode({ n, state, chip, decision }: { n: Node; state: NodeState; chip: NodeChip | undefined; decision?: Decision }) {
  const reduce = useReducedMotion();
  const code = n.kind === "code";
  const leader = n.kind === "leader";
  const tone = decision && state === "done" ? decisionTone(decision) : null;
  const ran = state !== "idle";
  return (
    <div
      className="absolute flex w-[190px] flex-col items-center text-center"
      style={{ left: `${(n.x / W) * 100}%`, top: `${(n.y / H) * 100}%`, transform: `translate(-50%, ${leader ? -40 : -32}px)` }}
      role="group"
      aria-label={`${n.name}: ${state}${chip ? `, ${chip.text}` : ""}`}
    >
      <motion.span
        animate={state === "busy" && !reduce ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={state === "busy" ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : spring.smooth}
        className={cn(
          "relative grid place-items-center border-[1.5px] transition-[border-color,color,box-shadow,background-color] duration-300",
          leader ? "size-20 rounded-full" : code ? "size-16 rounded-2xl" : "size-16 rounded-full",
          // Amber is Countersign at work; ice blue is the Policy Engine (plain code); the Payer's money is green.
          leader && "border-accent/50 bg-[#140f07] text-accent shadow-[0_0_40px_rgba(242,176,76,0.25)]",
          !leader && !code && n.kind !== "money" && state === "idle" && "border-white/15 bg-background text-white/40",
          !leader && !code && state === "busy" && "border-accent bg-[#1a140a] text-accent-ink shadow-[0_0_34px_rgba(242,176,76,0.45)]",
          !leader && !code && n.kind !== "money" && state === "done" && "border-accent/45 bg-background text-accent",
          code && !tone && (state === "busy" ? "border-code bg-[#0e2233] text-code-ink shadow-[0_0_40px_rgba(124,196,245,0.5)]" : "border-code/40 bg-[#0b1824] text-code"),
          n.kind === "money" && state === "idle" && "border-pay/25 bg-background text-pay/50",
          state === "failed" && "border-block bg-[#1f0d09] text-block-ink",
          state === "paid" && "border-pay bg-[#0d1f16] text-pay-ink shadow-[0_0_36px_rgba(91,214,155,0.45)]",
          state === "sealed" && "border-code/60 bg-[#0b1824] text-code shadow-[0_0_0_4px_rgba(124,196,245,0.1)]",
          tone === "pay" && "border-pay bg-[#0d1f16] text-pay-ink shadow-[0_0_32px_rgba(91,214,155,0.35)]",
          tone === "block" && "border-block bg-[#1f0d09] text-block-ink shadow-[0_0_32px_rgba(255,107,74,0.35)]",
          tone === "hold" && "border-hold bg-[#1a140a] text-hold-ink shadow-[0_0_32px_rgba(242,176,76,0.3)]",
          tone === "owner" && "border-owner bg-[#17112a] text-owner-ink shadow-[0_0_32px_rgba(195,166,255,0.3)]",
          tone === "quiet" && "border-white/40 bg-background text-foreground",
        )}
      >
        {state === "busy" && !reduce && <span className={cn("room-ring absolute -inset-2 border", code ? "rounded-[20px] border-code" : "rounded-full border-accent")} aria-hidden="true" />}
        <Glyph id={n.id} />
        {state === "done" && !leader && !code && (
          <Badge className="bg-accent text-black">
            <Check className="size-3 stroke-[3]" />
          </Badge>
        )}
        {state === "failed" && (
          <Badge className="bg-block text-white">
            <X className="size-3 stroke-[3]" />
          </Badge>
        )}
        {state === "sealed" && (
          <Badge className="bg-code text-black">
            <Lock className="size-3 stroke-[2.5]" />
          </Badge>
        )}
      </motion.span>
      <span className={cn("mt-2 rounded-md px-2 text-[15px] font-semibold leading-tight tracking-[-0.01em]", code ? "text-code-ink" : ran || leader ? "text-foreground" : "text-white/50")}>{n.name}</span>
      <span className="mt-1 hidden rounded px-2 font-mono text-[11.5px] leading-tight text-subtle lg:block">{n.tech}</span>
      {chip && (
        <motion.span
          key={chip.text}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.smooth}
          className={cn(
            "mt-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 font-mono text-[12px]",
            state === "paid"
              ? "border-pay/50 bg-pay/10 text-pay-ink"
              : state === "failed"
                ? "border-block/50 bg-block/10 text-block-ink"
                : state === "busy"
                  ? "border-accent/50 bg-accent/10 text-accent-ink"
                  : state === "sealed"
                    ? "border-code/40 bg-code/10 text-code-ink"
                    : n.id === "owner"
                      ? "border-owner/40 bg-owner/10 text-owner-ink"
                      : "border-border-strong bg-background text-muted-foreground",
          )}
        >
          {chip.text}
        </motion.span>
      )}
    </div>
  );
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={cn("absolute -right-1 -top-1 grid size-5 place-items-center rounded-full ring-2 ring-background", className)} aria-hidden="true">
      {children}
    </span>
  );
}

function Glyph({ id }: { id: AgentId }): ReactNode {
  const common = { className: id === "leader" ? "size-7" : "size-6", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
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
