"use client";
// Agent lanes (spec §7.2): one card per agent that has run on this case, in pipeline order. Each card is
// the latest real agentRuns row for that agent plus the rows it produced (callbacks, approvals, payments).
// Nothing is animated for show: a card moves only when its row changes. (The room graph shows the agents
// that haven't run.)
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, LoaderCircle, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
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

/** One card per agent that has run, in pipeline order, each with its finding and the evidence behind it. */
export function AgentLanes({ detail }: { detail: CaseDetail }) {
  const ran = LANES.map((lane) => ({ lane, run: latestRun(detail.runs, lane.agent) })).filter((x) => x.run);
  if (ran.length === 0) {
    return <p className="rounded-xl border border-dashed border-border-strong px-5 py-6 text-[14px] text-muted-foreground">The agents haven&apos;t started on this case yet.</p>;
  }
  return (
    <ol className="space-y-2" aria-label="What each agent found">
      <AnimatePresence initial={false}>
        {ran.map(({ lane, run }) => (
          <LaneCard key={lane.agent} lane={lane} run={run!} detail={detail} />
        ))}
      </AnimatePresence>
    </ol>
  );
}

function LaneCard({ lane, run, detail }: { lane: (typeof LANES)[number]; run: Run; detail: CaseDetail }) {
  const status = run.status;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.smooth}
      className={cn(
        "rounded-xl border bg-surface px-4 py-3",
        status === "running" ? "border-accent/50 shadow-[0_0_24px_rgba(242,176,76,0.12)]" : status === "failed" ? "border-block/40" : lane.agent === "policy" ? "border-code/30" : "border-border",
      )}
      aria-label={`${lane.title}: ${status}`}
    >
      <p className="flex items-center justify-between gap-3 font-mono text-[12px] uppercase tracking-[0.12em]">
        <span className={lane.agent === "policy" ? "text-code-ink" : "text-accent"}>{lane.title}</span>
        <span className={cn("flex items-center gap-1.5", status === "failed" ? "text-block-ink" : status === "running" ? "text-accent-ink" : "text-muted-foreground")}>
          {status === "running" ? <LoaderCircle className="size-3.5 animate-spin" /> : status === "failed" ? <AlertCircle className="size-3.5" /> : <Check className="size-3.5 stroke-[2.5]" />}
          {status === "running" ? "Working" : status === "failed" ? "Failed" : "Done"}
          {run.endedAt ? <span className="text-subtle normal-case">· {((run.endedAt - run.startedAt) / 1000).toFixed(1)}s</span> : null}
        </span>
      </p>
      <p className="mt-1.5 text-[14.5px] font-medium leading-snug text-foreground">
        {run.error ? `Failed: ${run.error}` : run.summary ? <Summary text={run.summary} /> : lane.role}
      </p>
      <div className="mt-2">
        <LaneDetail agent={lane.agent} run={run} detail={detail} />
      </div>
    </motion.li>
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
