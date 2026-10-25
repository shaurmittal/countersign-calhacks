"use client";
// The agent roster (spec §7.2). Seven agents in seven fixed slots, always in the same order, so a room
// learns the board once. Each slot is the latest real agentRuns row for that agent plus the rows it
// produced (callbacks, approvals, payments); an agent that hasn't run shows as not needed or not yet.
// Nothing is animated for show: a slot moves only when its row changes. Timeline styling adapted from
// EasyUI's AI Agent Activity (MIT: github.com/Surajmaurya1/easyui).
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Check, ChevronDown, LoaderCircle, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { api } from "../../convex/_generated/api";
import type { AgentName, PaymentRequest, PolicyResult, RiskFindings, VendorFindings } from "../../shared/types";
import { formatCents, RAIL_LABEL } from "../../shared/ledger";
import { crsLaneText } from "../../shared/verification/crs";
import { cn } from "../ui/cn";
import { spring } from "../ui/motion";
import { Tag, type Tone } from "../ui/primitives";
import { clockTime, last4, ruleInfo, secondsLeft, useNow } from "./format";

export type CaseDetail = NonNullable<FunctionReturnType<typeof api.warRoom.caseDetail>>;
type Run = CaseDetail["runs"][number];

const LANES: { agent: AgentName; title: string; role: string }[] = [
  { agent: "intake", title: "Intake Parser", role: "Claude reads the request into a strict form" },
  { agent: "vendorVerifier", title: "Vendor Verifier", role: "Vendor book, sender, bank, invoice, CRS, OFAC" },
  { agent: "riskAnalyst", title: "Risk Analyst", role: "Red flags and a risk score" },
  { agent: "callback", title: "Callback Verifier", role: "Calls the vendor on the number on file" },
  { agent: "policy", title: "Policy Engine", role: "Deterministic rules; the only code that can return PAY" },
  { agent: "ownerConcierge", title: "Owner Concierge", role: "Asks the owner for her authenticator code" },
  { agent: "payer", title: "Payer", role: "Signs exactly one transfer, only on PAY" },
];

export function AgentLanes({ detail, closed }: { detail: CaseDetail; closed: boolean }) {
  return (
    <ol className="relative" aria-label="Agents, in order">
      {LANES.map((lane, i) => {
        const run = latestRun(detail.runs, lane.agent);
        return <Slot key={lane.agent} lane={lane} run={run} detail={detail} closed={closed} last={i === LANES.length - 1} />;
      })}
    </ol>
  );
}

function Slot(props: { lane: (typeof LANES)[number]; run: Run | undefined; detail: CaseDetail; closed: boolean; last: boolean }) {
  const { lane, run, detail } = props;
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const status = run?.status ?? (props.closed ? "skipped" : "pending");
  const body = run ? <LaneDetail agent={lane.agent} run={run} detail={detail} /> : null;
  return (
    <li className="relative flex gap-3.5">
      {!props.last && <span aria-hidden="true" className="absolute bottom-0 left-[11px] top-7 w-px bg-border" />}
      <span
        className={cn(
          "relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border",
          status === "running" && "border-white/40 bg-background",
          status === "done" && "border-white/20 bg-white/[0.08]",
          status === "failed" && "border-block/50 bg-block/15",
          (status === "pending" || status === "queued" || status === "skipped") && "border-border bg-background",
        )}
        aria-hidden="true"
      >
        {status === "running" ? (
          <LoaderCircle className="size-3.5 animate-spin text-foreground" />
        ) : status === "done" ? (
          <Check className="size-3.5 stroke-[2.5] text-foreground" />
        ) : status === "failed" ? (
          <AlertCircle className="size-3.5 text-block-ink" />
        ) : (
          <span className="size-1 rounded-full bg-white/25" />
        )}
      </span>
      <div className={cn("min-w-0 flex-1", props.last ? "pb-1" : "pb-5")}>
        <button
          type="button"
          disabled={!body}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={body ? open : undefined}
          className="group flex w-full items-start justify-between gap-3 text-left disabled:cursor-default"
        >
          <span className="min-w-0">
            <span className={cn("block text-[13.5px] font-medium", run ? "text-foreground" : "text-subtle")}>
              {lane.title}
              <span className="ml-2 text-[12px] font-normal text-subtle">
                {status === "running" ? "working…" : status === "skipped" ? "not needed" : status === "pending" || status === "queued" ? "not yet" : status === "failed" ? "failed" : ""}
              </span>
            </span>
            <span className={cn("mt-0.5 block text-[12.5px] leading-snug", run?.summary ? "text-muted-foreground" : "text-white/30")}>
              {run?.error ? `Failed: ${run.error}` : run?.summary ? <Summary text={run.summary} /> : lane.role}
            </span>
          </span>
          {body && (
            <span className="flex shrink-0 items-center gap-2 pt-0.5 font-mono text-[11px] text-subtle">
              {run?.endedAt ? `${((run.endedAt - run.startedAt) / 1000).toFixed(1)}s` : ""}
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : spring.snappy}>
                <ChevronDown className="size-3.5 text-subtle group-hover:text-foreground" />
              </motion.span>
            </span>
          )}
        </button>
        <AnimatePresence initial={false}>
          {body && open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={reduce ? { duration: 0 } : spring.smooth}
              className="overflow-hidden"
            >
              <div className="mt-2.5 border-l border-border pl-3">{body}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
}

/** Lane summaries sometimes carry a "⚠"; the board draws its own icon instead of a font glyph. */
function Summary({ text }: { text: string }) {
  const glyph = /[\u2600-\u27BF]\uFE0F?/u;
  if (!glyph.test(text)) return <>{text}</>;
  return (
    <span className="inline-flex items-start gap-1.5">
      <TriangleAlert className="mt-[3px] size-3.5 shrink-0 text-foreground" aria-hidden="true" />
      {text.replace(new RegExp(glyph.source, "gu"), "").replace(/\s{2,}/g, " ").trim()}
    </span>
  );
}

function latestRun(runs: Run[], agent: AgentName): Run | undefined {
  return runs.filter((r) => r.agent === agent).sort((a, b) => b.startedAt - a.startedAt)[0];
}

function LaneDetail({ agent, run, detail }: { agent: AgentName; run: Run; detail: CaseDetail }) {
  switch (agent) {
    case "intake":
      return run.output ? <IntakeDetail request={run.output as PaymentRequest} /> : null;
    case "vendorVerifier":
      return run.output ? <VendorDetail findings={run.output as VendorFindings} detail={detail} /> : null;
    case "riskAnalyst":
      return run.output ? <RiskDetail risk={run.output as RiskFindings} /> : null;
    case "callback":
      return <CallbackDetail detail={detail} />;
    case "policy":
      return run.output ? <PolicyDetail result={run.output as PolicyResult} /> : null;
    case "ownerConcierge":
      return <OwnerDetail detail={detail} />;
    case "payer":
      return <PayerDetail detail={detail} />;
  }
}

function Chips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

/** A lane fact. Old "ok/warn/bad/info" tones map onto the board's palette; "ok" stays white, green is for money. */
function Chip({ tone, children, title, className }: { tone?: string; children: ReactNode; title?: string; className?: string }) {
  const map: Record<string, Tone> = { ok: "neutral", warn: "hold", bad: "block", info: "owner", money: "pay", approved: "pay", "": "quiet" };
  return (
    <Tag tone={tone === undefined ? "neutral" : (map[tone] ?? "quiet")} title={title} className={className}>
      {children}
    </Tag>
  );
}

function IntakeDetail({ request: r }: { request: PaymentRequest }) {
  return (
    <Chips>
      <Chip>Action: {r.requestedAction}</Chip>
      {r.claimedVendorName && <Chip>Payee claimed: {r.claimedVendorName}</Chip>}
      {r.amountCents != null && <Chip>{formatCents(r.amountCents)}</Chip>}
      {r.invoiceNumber && <Chip>Invoice #{r.invoiceNumber}</Chip>}
      <Chip>Sender says: {r.claimedSenderRole}</Chip>
      {r.newBankDetails && <Chip tone="warn">New bank {last4(r.newBankDetails.account)}</Chip>}
      {r.urgencyClaims?.map((u) => (
        <Chip key={u} tone="warn">
          Urgency: “{u}”
        </Chip>
      ))}
      {r.injectionAttempt && <Chip tone="bad">Injection attempt</Chip>}
    </Chips>
  );
}

function VendorDetail({ findings: f, detail }: { findings: VendorFindings; detail: CaseDetail }) {
  const matched = f.vendorId && detail.summary.vendorOnFile;
  return (
    <Chips>
      {matched ? (
        <Chip tone="ok">
          Match: {detail.summary.vendorName} ({Math.round(f.matchConfidence * 100)}%)
        </Chip>
      ) : (
        <Chip tone="bad">No vendor-book match</Chip>
      )}
      <Chip tone={f.senderOnFile ? "ok" : "warn"}>Sender {f.senderOnFile ? "on file" : "not on file"}</Chip>
      {f.bankMatches != null && (
        <Chip tone={f.bankMatches ? "ok" : "bad"}>Bank {f.bankMatches ? "matches file" : "differs from file"}</Chip>
      )}
      <Chip tone={crsTone(f)}>{crsLaneText(f.crs) ?? "CRS: not checked"}</Chip>
      <Chip tone={f.ofacHit ? "bad" : "ok"}>OFAC: {f.ofacHit ? "HIT" : "clear"}</Chip>
      {f.alreadyPaidAt != null ? (
        <Chip tone="bad">Invoice already paid</Chip>
      ) : (
        <Chip tone={f.matchingInvoiceId ? "ok" : "warn"}>
          {f.matchingInvoiceId ? `Open invoice #${detail.summary.invoiceNumber ?? "?"}` : "No matching invoice"}
        </Chip>
      )}
    </Chips>
  );
}

function crsTone(f: VendorFindings): string {
  if (f.crs?.status === "ok") return f.crs.businessVerified === false ? "bad" : "ok";
  return f.crs?.status === "unavailable" ? "warn" : "";
}

function RiskDetail({ risk }: { risk: RiskFindings }) {
  const score = Math.max(0, Math.min(100, risk.riskScore ?? 0));
  return (
    <>
      <Chips>
        <Chip>Risk {score}/100</Chip>
        {risk.flags?.map((flag) => (
          <Chip key={flag} tone="warn">
            {flag.replace(/_/g, " ")}
          </Chip>
        ))}
        <span className="flex h-[22px] w-28 items-center" role="img" aria-label={`Risk score ${score} of 100`}>
          <span className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <span
              className={cn("block h-full origin-left rounded-full transition-transform duration-500", "bg-white/70")}
              style={{ transform: `scaleX(${score / 100})` }}
            />
          </span>
        </span>
      </Chips>
      {risk.explanation && (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">{risk.explanation}</p>
      )}
    </>
  );
}

const OUTCOME_TONE: Record<string, string> = { confirmed: "approved", denied: "bad", no_answer: "warn", unclear: "warn" };

function CallbackDetail({ detail }: { detail: CaseDetail }) {
  const latest = [...detail.callbacks].sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!latest) return null;
  return (
    <>
      <Chips>
        <Chip>
          Dialed {latest.numberDialed} · on file
          {latest.attempt > 1 && ` · attempt ${latest.attempt}`}
        </Chip>
        {latest.outcome ? (
          <Chip tone={OUTCOME_TONE[latest.outcome] ?? ""}>Vendor said: {latest.outcome.replace("_", " ")}</Chip>
        ) : (
          <Chip tone="info">Calling…</Chip>
        )}
      </Chips>
      {latest.transcript && (
        <pre className="mt-2.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-white/[0.02] p-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
          {latest.transcript}
        </pre>
      )}
    </>
  );
}

function PolicyDetail({ result }: { result: PolicyResult }) {
  return (
    <Chips>
      {result.firedRules.map((id) => (
        <Chip key={id} title={ruleInfo(id)?.description}>
          {id} {ruleInfo(id)?.name}
        </Chip>
      ))}
      {result.needs.callback && <Chip tone="info">Needs callback</Chip>}
      {result.needs.ownerOtp && <Chip tone="info">Needs owner code</Chip>}
      {!result.overridable && <Chip tone="bad">Not overridable</Chip>}
    </Chips>
  );
}

function OwnerDetail({ detail }: { detail: CaseDetail }) {
  const now = useNow();
  const approval = [...detail.approvals].sort((a, b) => b.requestedAt - a.requestedAt)[0];
  if (!approval) return null;
  const via = approval.method === "otp" ? "owner page" : "ASI:One";
  let state: ReactNode;
  if (approval.cancelledAt) {
    const verb = approval.approvedAt ? "Cancelled during cooling-off" : "Declined";
    state = <Chip tone="bad">{verb} by owner via {via}</Chip>;
  } else if (approval.approvedAt && approval.coolingOffUntil && approval.coolingOffUntil > now) {
    state = <Chip tone="warn">Approved · cooling-off {secondsLeft(approval.coolingOffUntil, now)}s</Chip>;
  } else if (approval.approvedAt) state = <Chip tone="approved">Approved by owner via {via}</Chip>;
  else state = <Chip tone="info">Waiting for the owner&apos;s code since {clockTime(approval.requestedAt)}</Chip>;

  const locked = approval.lockedUntil && approval.lockedUntil > now;
  return (
    <Chips>
      {state}
      {locked && <Chip tone="bad">Locked after wrong codes · {secondsLeft(approval.lockedUntil!, now)}s</Chip>}
      {!locked && (approval.attempts ?? 0) > 0 && <Chip tone="warn">{approval.attempts} wrong code(s)</Chip>}
    </Chips>
  );
}

function PayerDetail({ detail }: { detail: CaseDetail }) {
  const payment = [...detail.payments].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!payment) return null;
  const tone = payment.status === "sent" ? "money" : payment.status === "failed" ? "bad" : "info";
  return (
    <>
      <Chips>
        <Chip>{RAIL_LABEL[payment.rail]}</Chip>
        <Chip tone={tone}>
          {formatCents(payment.amountCents)} · {payment.status}
        </Chip>
        {payment.externalId && <Chip className="font-mono">{payment.externalId}</Chip>}
      </Chips>
      {payment.status === "sent" && (
        <table className="mt-2.5 w-full max-w-md text-[12px]">
          <caption className="sr-only">Journal entry</caption>
          <thead>
            <tr className="border-b border-border text-left text-subtle">
              <th className="py-1.5 font-normal">Account</th>
              <th className="py-1.5 text-right font-normal">Debit</th>
              <th className="py-1.5 text-right font-normal">Credit</th>
            </tr>
          </thead>
          <tbody className="font-mono text-muted-foreground">
            {payment.journal.map((line) => (
              <tr key={line.account} className="border-b border-border last:border-0">
                <td className="py-1.5 font-sans">{line.account}</td>
                <td className="py-1.5 text-right">{line.debitCents ? formatCents(line.debitCents) : ""}</td>
                <td className="py-1.5 text-right">{line.creditCents ? formatCents(line.creditCents) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
