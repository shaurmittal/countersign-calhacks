"use client";
// The live strip (spec §7.2): the selected request as one wide flight strip. Who sent what, what Countersign
// replied, and the verdict stamped at the strip's end, with the rules that decided it.
import type { FunctionReturnType } from "convex/server";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { api } from "../../convex/_generated/api";
import { formatCents, RAIL_LABEL } from "../../shared/ledger";
import { RULES } from "../../shared/policy/rules";
import type { Decision, PaymentRequest, PolicyResult, RuleId } from "../../shared/types";
import { cn } from "../ui/cn";
import { decisionTone, Stamp, Tag } from "../ui/primitives";
import type { CaseDetail } from "./AgentLanes";
import { ChannelIcon, IncomingMessage } from "./Incoming";
import { channelLabel, clockTime, ruleInfo, secondsLeft, useNow } from "./format";

export type CaseRow = FunctionReturnType<typeof api.cases.recent>[number];

/** When several rules fired, the first of these present is the one worth reading first. */
const KEY_RULE_ORDER: RuleId[] = ["R10", "R17", "R16", "R13", "R9", "R8", "R1", "R12"];

export function DecisionCard({ c, detail }: { c: CaseRow; detail: CaseDetail | undefined }) {
  const now = useNow();
  const reduce = useReducedMotion();
  const result = c.policyResult as PolicyResult | undefined;
  const request = c.request as PaymentRequest | undefined;
  const decision: Decision | undefined = c.decision ?? result?.decision;
  const approval = detail?.approvals.at(-1);
  const coolingOff =
    approval?.approvedAt && !approval.cancelledAt && approval.coolingOffUntil && approval.coolingOffUntil > now
      ? approval.coolingOffUntil
      : null;
  const fired = new Set<RuleId>(result?.firedRules ?? []);
  const keyRule = KEY_RULE_ORDER.find((id) => fired.has(id)) ?? result?.firedRules[0];
  const reasonFor = (id: RuleId) => result?.reasons.find((reason) => reason.startsWith(`${id} `));
  const tone = decisionTone(decision);
  const amount = request?.amountCents ?? detail?.summary.amountCents ?? null;
  const payee = detail?.summary.vendorName ?? request?.claimedVendorName ?? null;

  return (
    <section
      aria-label="Live case"
      className={cn(
        "overflow-hidden rounded-xl border bg-surface transition-colors duration-500",
        tone === "pay" ? "border-pay/30" : tone === "block" ? "border-block/30" : "border-border",
      )}
    >
      {/* The strip: fixed columns, only the values change. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-border px-4 py-4 sm:grid-cols-[88px_150px_minmax(0,1fr)_auto] sm:px-6">
        <time className="font-mono text-[13px] text-muted-foreground" dateTime={new Date(c.createdAt).toISOString()}>
          {clockTime(c.createdAt)}
        </time>
        <span className="hidden items-center gap-2 text-[14px] text-foreground/90 sm:flex">
          <ChannelIcon channel={c.channel} />
          {channelLabel(c.channel)}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2.5 text-[16px] font-medium leading-snug tracking-[-0.01em] text-foreground">
            <span className="break-words">{payee ?? "Unknown payee"}</span>
            {amount != null && <span className="font-mono text-[15px] font-normal text-foreground/85">{formatCents(amount)}</span>}
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-[13px] text-subtle">
            <ChannelIcon channel={c.channel} className="size-3.5 sm:hidden" />
            <span className="sr-only sm:hidden">{channelLabel(c.channel)}</span>
            <span className="truncate">from {c.fromAddress}</span>
          </p>
        </div>
        <motion.span
          key={decision ?? c.status}
          initial={reduce ? false : { opacity: 0, scale: 1.18, filter: "blur(6px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ type: "spring", stiffness: 260, damping: 22, mass: 0.8 }}
          role="status"
          aria-live="polite"
        >
          <Stamp tone={tone} size="lg" className="max-sm:h-8 max-sm:px-2.5 max-sm:text-[15px]">
            {decision ? verdictWord(decision, request) : `${c.status.replace(/_/g, " ").toLowerCase()}…`}
          </Stamp>
        </motion.span>
      </div>

      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <IncomingMessage c={c} />
        <div className="border-t border-border px-4 py-5 sm:px-6 md:border-l md:border-t-0">
          <p className="text-[15px] leading-snug text-foreground">{decision ? explain(decision, result, detail) : "Countersign is checking this request."}</p>
          {coolingOff && (
            <p className="mt-3 flex items-center gap-2 font-mono text-[12.5px] text-hold-ink" role="timer">
              <span className="size-1.5 rounded-full bg-hold" aria-hidden="true" />
              Owner approved · releases in {secondsLeft(coolingOff, now)}s · she can still cancel
            </p>
          )}
          {result && result.firedRules.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Rules that fired">
              {result.firedRules.map((id) => (
                <li key={id}>
                  <Tag tone={id === keyRule ? decisionTone(decision) : "neutral"} title={reasonFor(id)}>
                    <b className="font-mono font-medium">{id}</b> {ruleInfo(id)?.name ?? "rule"}
                  </Tag>
                </li>
              ))}
            </ul>
          )}
          <ol className="mt-4 flex flex-wrap gap-1" aria-label={`All ${Object.keys(RULES).length} rules, fired ones lit`}>
            {(Object.keys(RULES) as RuleId[]).map((id) => (
              <li
                key={id}
                title={`${id} ${RULES[id].name}`}
                className={cn(
                  "grid h-6 min-w-8 place-items-center rounded px-1 font-mono text-[12px] transition-colors duration-300",
                  !fired.has(id)
                    ? decision
                      ? "bg-white/[0.06] text-subtle"
                      : "bg-white/[0.03] text-white/30"
                    : id === keyRule && tone === "block"
                      ? "bg-block text-white"
                      : id === keyRule && tone === "pay"
                        ? "bg-pay text-black"
                        : id === keyRule && tone === "hold"
                          ? "bg-hold text-black"
                          : "bg-foreground text-background",
                )}
              >
                {id}
              </li>
            ))}
          </ol>
          {result && result.reasons.length > 0 && (
            <details className="group mt-4 text-[13.5px]">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 select-none text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 transition-transform duration-200 group-open:rotate-90" aria-hidden="true" />
                Why, in the engine&apos;s words
              </summary>
              <ul className="mt-2 space-y-1.5 border-l border-border pl-3 text-muted-foreground">
                {result.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}

function explain(decision: Decision, result: PolicyResult | undefined, detail: CaseDetail | undefined): string {
  const vendor = detail?.summary.vendorName ?? "the vendor";
  const payment = detail?.payments.find((p) => p.status === "sent");
  switch (decision) {
    case "PAY":
      return payment
        ? `Paid ${formatCents(payment.amountCents)} to ${vendor}'s account on file via ${RAIL_LABEL[payment.rail]}.`
        : "Every check passed. Releasing the payment to the account on file.";
    case "BLOCK":
      return result?.overridable === false
        ? "Refused. Nobody can override this, not even the owner."
        : "Refused. The owner has been alerted.";
    case "HOLD":
      if (result?.needs.callback) return `Holding while Countersign calls ${vendor} on the number already on file.`;
      return "Held. Nothing is paid until the missing check passes.";
    case "ESCALATE":
      return "Waiting for the owner's authenticator code. A voice or a text message is never enough.";
    case "NO_ACTION": {
      // "No payment was requested: a meeting request, passed to the owner" -> "Not a payment: a meeting request, …"
      const triage = result?.reasons[0]?.replace(/^No payment was requested:?\s*/, "");
      return triage && triage !== "nothing to pay" ? `Not a payment: ${triage}.` : "No payment was requested.";
    }
  }
}

/** The stamp's word. A message that asks for no money is forwarded to the owner, filtered as spam, or just answered. */
export function verdictWord(decision: Decision, request: PaymentRequest | undefined): string {
  if (decision !== "NO_ACTION") return decision;
  const type = request?.messageType;
  if (type === "sales_or_spam") return "FILTERED";
  if (type && type !== "payment") return "FORWARDED";
  return "NO ACTION";
}
