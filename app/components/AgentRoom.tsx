"use client";
// The case as a flow, live: request → Intake → Vendor Verifier ∥ Risk Analyst → Policy Engine, with the
// callback and the owner's code as detours that loop back into the Policy Engine, and the lock between the
// Policy Engine and the Payer that only PAY crosses. Fed by this case's real rows (roomState.ts): steps are
// numbered in the order they actually ran, the route the case took stays lit, a dot travels the connector
// that is working right now, and a caption says what is happening. Nothing moves unless a row changes.
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Check, Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentName, Decision, PolicyResult } from "../../shared/types";
import type { AgentId } from "../demo/film/story";
import { cn } from "../ui/cn";
import { spring } from "../ui/motion";
import { decisionTone, type Tone } from "../ui/primitives";
import type { CaseDetail } from "./AgentLanes";
import type { CaseRow } from "./DecisionCard";
import { ChannelIcon } from "./Incoming";
import { channelLabel, useNow } from "./format";
import { deriveRoom } from "./roomState";

export type NodeState = "idle" | "busy" | "done" | "sealed" | "failed" | "paid";
export type NodeChip = { text: string; money?: boolean };

type Step = Exclude<AgentId, "leader">;

// The drawing's coordinate space; cards are placed by their centres in it.
const W = 1000;
const H = 440;
const CARD_H = 54; // a card is about 54px tall at the drawing's native ~1000px width

type Layout = { cardW: number; gateX: number; showRequest: boolean; pos: Record<Step | "request", { x: number; y: number }> };

/** Wide: the request card leads. Compact (under ~760px of drawing): the case header already names the
 * channel, so the flow starts at Intake and the cards get the width back. */
const WIDE: Layout = {
  cardW: 182,
  gateX: 795,
  showRequest: true,
  pos: {
    request: { x: 91, y: 220 },
    intake: { x: 290, y: 220 },
    verifier: { x: 485, y: 122 },
    risk: { x: 485, y: 318 },
    lock: { x: 680, y: 220 },
    callback: { x: 680, y: 42 },
    owner: { x: 680, y: 398 },
    payer: { x: 909, y: 220 },
  },
};
const COMPACT: Layout = {
  cardW: 214,
  gateX: 785,
  showRequest: false,
  pos: {
    request: { x: -200, y: 220 },
    intake: { x: 107, y: 220 },
    verifier: { x: 350, y: 122 },
    risk: { x: 350, y: 318 },
    lock: { x: 600, y: 220 },
    callback: { x: 600, y: 42 },
    owner: { x: 600, y: 398 },
    payer: { x: 893, y: 220 },
  },
};

const NAMES: Record<Step, { name: string; tech: string }> = {
  intake: { name: "Intake", tech: "Claude reads it" },
  verifier: { name: "Vendor check", tech: "Vendor book · CRS" },
  risk: { name: "Risk check", tech: "Rules + Claude" },
  callback: { name: "Callback", tech: "Number on file" },
  owner: { name: "Owner's code", tech: "Authenticator" },
  lock: { name: "Policy Engine", tech: "Plain code · no AI" },
  payer: { name: "Payer", tech: "Countersigned transfer" },
};

const AGENT_OF_STEP: Record<Step, AgentName> = {
  intake: "intake",
  verifier: "vendorVerifier",
  risk: "riskAnalyst",
  callback: "callback",
  owner: "ownerConcierge",
  lock: "policy",
  payer: "payer",
};

/** What each step is doing while it works, for the caption. */
const DOING: Record<Step, string> = {
  intake: "Intake Parser is reading the request (Claude, treating it as untrusted)",
  verifier: "Vendor Verifier is checking the vendor book, sender, bank and invoice",
  risk: "Risk Analyst is scoring the red flags",
  callback: "Countersign is phoning the vendor on the number already on file",
  owner: "Waiting for Priya's authenticator code",
  lock: "The Policy Engine is deciding, in plain code",
  payer: "The Payer is sending one countersigned transfer",
};

type Edge = { id: string; to: Step; d: string; detour?: boolean };
type Pt = { x: number; y: number };

const curve = (a: Pt, b: Pt) => {
  const mid = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`;
};

function edgesFor(L: Layout) {
  const right = (k: Step | "request") => ({ x: L.pos[k].x + L.cardW / 2, y: L.pos[k].y });
  const left = (k: Step) => ({ x: L.pos[k].x - L.cardW / 2, y: L.pos[k].y });
  /** A detour up or down from the Policy Engine and back: out on the left side, back in on the right. */
  const loop = (to: "callback" | "owner") => {
    const dir = to === "callback" ? -1 : 1;
    const ox = L.pos.lock.x - 46;
    const ix = L.pos.lock.x + 46;
    const y0 = L.pos.lock.y + (dir * CARD_H) / 2;
    const y1 = L.pos[to].y - (dir * CARD_H) / 2;
    return `M ${ox} ${y0} L ${ox} ${y1} M ${ix} ${y1} L ${ix} ${y0}`;
  };
  const edges: Edge[] = [
    ...(L.showRequest ? [{ id: "request-intake", to: "intake" as Step, d: curve(right("request"), left("intake")) }] : []),
    { id: "intake-verifier", to: "verifier", d: curve(right("intake"), left("verifier")) },
    { id: "intake-risk", to: "risk", d: curve(right("intake"), left("risk")) },
    { id: "verifier-lock", to: "lock", d: curve(right("verifier"), left("lock")) },
    { id: "risk-lock", to: "lock", d: curve(right("risk"), left("lock")) },
    { id: "lock-callback", to: "callback", d: loop("callback"), detour: true },
    { id: "lock-owner", to: "owner", d: loop("owner"), detour: true },
  ];
  return { edges, lockRight: right("lock").x, payerLeft: left("payer").x };
}

/** Width of an element, for picking the wide or compact drawing. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function AgentRoom({ c, detail }: { c: CaseRow; detail: CaseDetail | undefined }) {
  const now = useNow(1000);
  const reduce = useReducedMotion();
  const room = useMemo(() => deriveRoom(c, detail, now), [c, detail, now]);
  const decision: Decision | undefined = c.decision ?? (c.policyResult as PolicyResult | undefined)?.decision;
  const decided = room.states.lock === "done" && !!decision;
  const order = stepOrder(detail);
  const caption = nowCaption(room.states, c, decision);
  const payerReached = room.states.payer === "busy" || room.states.payer === "paid" || room.states.payer === "failed";
  const crossed = room.states.payer === "paid";
  const stopped = decided && !payerReached && c.status === "CLOSED" && decision !== "NO_ACTION";
  const [box, width] = useWidth<HTMLDivElement>();
  const L = width > 0 && width < 760 ? COMPACT : WIDE;
  const { edges, lockRight, payerLeft } = edgesFor(L);
  const y = L.pos.lock.y;
  const gx = L.gateX;
  const toPayer = `M ${lockRight} ${y} L ${payerLeft} ${y}`;

  return (
    <div>
      {/* On phones the caption and the step list below carry the story; the drawing needs width. */}
      <div ref={box} className="relative mx-auto hidden aspect-[1000/440] w-full max-w-[960px] sm:block">
        <svg className="absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {edges.map((e) => {
            const target = room.states[e.to];
            const taken = target !== "idle" && target !== "sealed";
            return (
              <g key={e.id}>
                <path d={e.d} className={cn("flow-edge", taken && "is-taken", e.detour && "is-detour")} />
                {target === "busy" && !reduce && <Packet d={e.d} />}
              </g>
            );
          })}

          {/* The lock: only PAY crosses. */}
          <line x1={gx} y1={y - 76} x2={gx} y2={y + 76} className={cn("flow-gate", crossed && "is-open", stopped && "is-shut")} />
          <path
            d={stopped ? `M ${lockRight} ${y} L ${gx - 8} ${y}` : toPayer}
            className={cn("flow-edge", (decided || payerReached) && "is-taken", crossed && "is-paid", stopped && "is-stopped")}
          />
          {room.states.payer === "busy" && !reduce && <Packet d={toPayer} money />}
          {stopped && <line x1={gx - 8} y1={y - 10} x2={gx - 8} y2={y + 10} className="flow-stop" />}
        </svg>

        <GateLabel x={gx} crossed={crossed} stopped={stopped} />
        {L.showRequest && <RequestCard c={c} L={L} />}
        {(Object.keys(NAMES) as Step[]).map((s) => (
          <StepCard
            key={s}
            step={s}
            L={L}
            state={room.states[s]}
            chip={room.chips[s]}
            n={order.get(s)}
            summary={summaryFor(detail, s)}
            tone={s === "lock" && decided ? decisionTone(decision) : null}
            closed={c.status === "CLOSED"}
          />
        ))}
      </div>

      <p className="flex min-h-6 items-start gap-2.5 text-[14px] leading-snug text-foreground/90 sm:mt-5" role="status" aria-live="polite">
        <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", caption.live ? "animate-pulse bg-foreground" : "bg-white/30")} aria-hidden="true" />
        <motion.span key={caption.text} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
          {caption.text}
        </motion.span>
      </p>
    </div>
  );
}

/** A dot travelling a connector while the step at its end is working. */
function Packet({ d, money }: { d: string; money?: boolean }) {
  return (
    <circle r={4} className={money ? "fill-pay-ink" : "fill-foreground"}>
      <animateMotion dur="1.3s" repeatCount="indefinite" path={d} />
    </circle>
  );
}

function GateLabel({ x, crossed, stopped }: { x: number; crossed: boolean; stopped: boolean }) {
  return (
    <p
      className={cn(
        "absolute flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded bg-background px-1.5 font-mono text-[11.5px]",
        crossed ? "text-pay-ink" : stopped ? "text-block-ink" : "text-subtle",
      )}
      style={{ left: `${(x / W) * 100}%`, top: `${(112 / H) * 100}%` }}
    >
      <Lock className="size-3" aria-hidden="true" />
      {crossed ? "PAY crossed the lock" : stopped ? "Stopped at the lock" : "Only PAY crosses"}
    </p>
  );
}

function place(L: Layout, k: Step | "request") {
  return { left: `${(L.pos[k].x / W) * 100}%`, top: `${(L.pos[k].y / H) * 100}%`, width: `${(L.cardW / W) * 100}%` };
}

function RequestCard({ c, L }: { c: CaseRow; L: Layout }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={place(L, "request")}>
      <div className="rounded-xl border border-white/40 bg-background px-3 py-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium leading-tight">
          <ChannelIcon channel={c.channel} className="size-3.5 text-foreground" />
          Request
        </span>
        <span className="mt-1 block truncate font-mono text-[11.5px] leading-tight text-muted-foreground">{channelLabel(c.channel)}</span>
      </div>
    </div>
  );
}

function StepCard(props: { step: Step; L: Layout; state: NodeState; chip: NodeChip | undefined; n: number | undefined; summary: string | null; tone: Tone | null; closed: boolean }) {
  const { step, state, chip, n, tone } = props;
  const reduce = useReducedMotion();
  const code = step === "lock";
  const ran = state !== "idle" && state !== "sealed";
  const status =
    state === "busy"
      ? "working…"
      : (chip?.text ?? props.summary ?? (state === "sealed" ? "never reached" : ran ? "done" : props.closed ? "not needed" : NAMES[step].tech));
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={place(props.L, step)} role="group" aria-label={`${NAMES[step].name}: ${status}`}>
      <div
        className={cn(
          "relative flex items-center border bg-background px-2.5 py-2 transition-[border-color,opacity,box-shadow] duration-300",
          code ? "rounded-md" : "rounded-xl",
          !ran && state !== "sealed" && "border-border opacity-55",
          state === "sealed" && "border-border",
          state === "busy" && "border-foreground shadow-[0_0_0_4px_rgba(255,255,255,0.06)]",
          state === "done" && !tone && "border-white/30",
          state === "failed" && "border-block/60",
          state === "paid" && "border-pay/60 shadow-[0_0_0_4px_rgba(34,197,94,0.08)]",
          tone === "pay" && "border-pay/60",
          tone === "block" && "border-block/60",
          tone === "hold" && "border-hold/50",
          tone === "owner" && "border-foreground",
        )}
      >
        {state === "busy" && !reduce && <span className={cn("room-ring absolute -inset-1 border border-white/40", code ? "rounded-lg" : "rounded-2xl")} aria-hidden="true" />}
        {n !== undefined && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={spring.snappy}
            className="absolute -left-2 -top-2 grid size-[18px] place-items-center rounded-full bg-foreground font-mono text-[10.5px] font-semibold text-background"
          >
            {n}
          </motion.span>
        )}
        <span className="min-w-0 flex-1">
          <span className={cn("flex items-start gap-1.5 text-[13px] font-medium leading-tight", ran ? "text-foreground" : "text-white/60")}>
            <span
              className={cn(
                "mt-px shrink-0",
                state === "paid" || tone === "pay" ? "text-pay-ink" : state === "failed" || tone === "block" ? "text-block-ink" : tone === "hold" ? "text-hold-ink" : ran ? "text-foreground" : "text-white/40",
              )}
            >
              {state === "done" && !code && step !== "payer" ? (
                <Check className="size-3.5 stroke-[2.5]" />
              ) : state === "failed" ? (
                <AlertCircle className="size-3.5" />
              ) : (
                <Glyph step={step} />
              )}
            </span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{NAMES[step].name}</span>
          </span>
          <span
            className={cn(
              "mt-1 block truncate font-mono text-[11.5px] leading-tight",
              state === "paid" || tone === "pay" ? "text-pay-ink" : state === "failed" || tone === "block" ? "text-block-ink" : tone === "hold" ? "text-hold-ink" : "text-muted-foreground",
            )}
            title={status}
          >
            {status}
          </span>
        </span>
      </div>
    </div>
  );
}

/** Steps numbered in the order their runs actually started. */
function stepOrder(detail: CaseDetail | undefined): Map<Step, number> {
  const first = new Map<Step, number>();
  for (const run of detail?.runs ?? []) {
    const step = (Object.keys(AGENT_OF_STEP) as Step[]).find((s) => AGENT_OF_STEP[s] === run.agent);
    if (step && (!first.has(step) || run.startedAt < first.get(step)!)) first.set(step, run.startedAt);
  }
  return new Map([...first.entries()].sort((a, b) => a[1] - b[1]).map(([s], i) => [s, i + 1]));
}

/** The step's own one-line result, shortened for the card. */
function summaryFor(detail: CaseDetail | undefined, step: Step): string | null {
  const runs = (detail?.runs ?? []).filter((r) => r.agent === AGENT_OF_STEP[step]).sort((a, b) => b.startedAt - a.startedAt);
  const summary = runs[0]?.summary?.replace(/[☀-➿]️?/gu, "").trim();
  if (!summary) return null;
  if (step === "lock") return summary.split(" · ")[0];
  return summary.split(" · ").slice(0, 2).join(" · ");
}

function nowCaption(states: Record<AgentId, NodeState>, c: CaseRow, decision: Decision | undefined): { text: string; live: boolean } {
  const order: Step[] = ["payer", "owner", "callback", "lock", "risk", "verifier", "intake"];
  const busy = order.find((id) => states[id] === "busy");
  if (busy) return { text: `${DOING[busy]}…`, live: true };
  if (c.status === "CLOSED") {
    if (states.payer === "paid") return { text: "Paid. The Policy Engine's PAY was the only key that crossed the lock.", live: false };
    if (states.payer === "failed") return { text: `${decision ?? "Closed"}. The Payer tried and the bank refused the transfer: $0 moved.`, live: false };
    if (decision === "NO_ACTION") return { text: "Not a payment. Nothing went near the lock.", live: false };
    return { text: `${decision ?? "Closed"}. Stopped at the lock: the Payer was never reached, $0 moved.`, live: false };
  }
  if (c.status === "CALLBACK_PENDING") return { text: `${DOING.callback}…`, live: true };
  if (c.status === "AWAITING_OWNER") return { text: `${DOING.owner}…`, live: true };
  return { text: "Countersign is running the case…", live: true };
}

function Glyph({ step }: { step: Step }): ReactNode {
  const common = { className: "size-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (step) {
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
