"use client";
// The verdict card (spec §7.2, right): what the Policy Engine decided, in one big stamp a room can read,
// then why, the rules that fired, and all of the rules with the fired ones lit.
import type { FunctionReturnType } from "convex/server";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Clock } from "lucide-react";
import type { api } from "../../convex/_generated/api";
import { formatCents, RAIL_LABEL } from "../../shared/ledger";
import { RULES } from "../../shared/policy/rules";
import type { Decision, PaymentRequest, PolicyResult, RuleId } from "../../shared/types";
import { cn } from "../ui/cn";
import { decisionTone, Tag, type Tone } from "../ui/primitives";
import type { CaseDetail } from "./AgentLanes";
import { ruleInfo, secondsLeft, useNow } from "./format";

export type CaseRow = FunctionReturnType<typeof api.cases.recent>[number];

/** When several rules fired, the first of these present is the one worth reading first. */
const KEY_RULE_ORDER: RuleId[] = ["R10", "R18", "R17", "R16", "R13", "R9", "R8", "R1", "R12"];

const STAMP: Record<Tone, string> = {
  pay: "border-pay text-pay-ink bg-pay/10",
  block: "border-block text-block-ink bg-block/10",
  hold: "border-hold text-hold-ink bg-hold/10",
  owner: "border-owner text-owner-ink bg-owner/10",
  code: "border-code text-code-ink bg-code/10",
  neutral: "border-white/30 text-muted-foreground",
  quiet: "border-white/40 text-foreground",
};

const PANEL: Record<Tone, string> = {
  pay: "border-pay/35",
  block: "border-block/35",
  hold: "border-hold/30",
  owner: "border-owner/35",
  code: "border-code/35",
  neutral: "border-border",
  quiet: "border-border-strong",
};

const LIT: Record<Tone, string> = {
  pay: "bg-pay text-black",
  block: "bg-block text-white",
  hold: "bg-hold text-black",
  owner: "bg-owner text-black",
  code: "bg-code text-black",
  neutral: "bg-code text-black",
  quiet: "bg-code text-black",
};

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

  return (
    <section aria-label="Decision" className={cn("rounded-xl border bg-surface px-5 py-4 transition-colors duration-500", PANEL[tone], decisionTint(tone))}>
      <motion.p
        key={decision ?? c.status}
        initial={reduce ? false : { opacity: 0, scale: 1.12, filter: "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ type: "spring", stiffness: 240, damping: 22, mass: 0.9 }}
        className={cn(
          "inline-flex origin-left items-center rounded-lg border-2 px-4 py-0.5 font-mono font-bold uppercase tracking-[0.08em]",
          decision ? "text-[36px] leading-[1.15] sm:text-[44px]" : "text-[20px] leading-[1.6] tracking-[0.04em]",
          STAMP[tone],
        )}
        role="status"
        aria-live="polite"
      >
        {decision ? verdictWord(decision, request) : `${c.status.replace(/_/g, " ").toLowerCase()}…`}
      </motion.p>

      <p className="mt-3 text-[16px] leading-snug text-foreground">
        {decision ? explain(decision, result, detail) : "Countersign is checking this request. The verdict lands here."}
      </p>

      {coolingOff && (
        <p className="mt-3 flex items-center gap-2 font-mono text-[14px] text-hold-ink" role="timer">
          <Clock className="size-4" aria-hidden="true" />
          Owner approved · releases in {secondsLeft(coolingOff, now)}s · she can still cancel
        </p>
      )}

      {result && result.firedRules.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Rules that fired">
          {result.firedRules.map((id) => (
            <li key={id}>
              <Tag tone={id === keyRule ? tone : "neutral"} title={reasonFor(id)} className="text-[13px]">
                <b className="font-mono font-semibold">{id}</b> {ruleInfo(id)?.name ?? "rule"}
              </Tag>
            </li>
          ))}
        </ul>
      )}

      <ol className="mt-3 grid grid-cols-6 gap-1 sm:grid-cols-9" aria-label={`All ${Object.keys(RULES).length} rules, fired ones lit`}>
        {(Object.keys(RULES) as RuleId[]).map((id) => (
          <li
            key={id}
            title={`${id} ${RULES[id].name}`}
            className={cn(
              "grid h-6 place-items-center rounded font-mono text-[11.5px] transition-colors duration-300",
              fired.has(id) ? (id === keyRule ? LIT[tone] : "bg-code/85 text-black") : decision ? "border border-border text-subtle" : "border border-border/60 text-white/30",
            )}
          >
            {id}
          </li>
        ))}
      </ol>

      {result && result.reasons.length > 0 && (
        <details className="group mt-3 text-[13.5px]">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
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
    </section>
  );
}

/** A faint wash of the verdict's colour across the card, so the room reads the outcome before the word. */
function decisionTint(tone: Tone): string {
  switch (tone) {
    case "pay":
      return "bg-[linear-gradient(160deg,rgba(91,214,155,0.12),transparent_55%)]";
    case "block":
      return "bg-[linear-gradient(160deg,rgba(255,107,74,0.13),transparent_55%)]";
    case "hold":
      return "bg-[linear-gradient(160deg,rgba(242,176,76,0.12),transparent_55%)]";
    case "owner":
      return "bg-[linear-gradient(160deg,rgba(195,166,255,0.13),transparent_55%)]";
    default:
      return "";
  }
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
