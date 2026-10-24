// Deterministic risk explanation (owner: P3). Spec §6.3: two plain-English sentences. Claude rewrites them from the
// flags (explainRewrite.ts), and this template stands whenever the rewrite can't be used.
// Display only, and it never states a decision. It is given no vendor data on purpose: case documents are returned
// by public queries and the text may be sent to the requester. Lookalike domains came from the request itself.
import type { RiskFlag } from "../types";
import { FLAG_ORDER } from "./riskFlags";

const NO_FLAGS =
  "No red flags were found in this request. The Policy Engine still checks the vendor, bank details and invoice before any money moves.";

/** How each flag reads in the first sentence's list. */
const PHRASES: Readonly<Record<RiskFlag, string>> = {
  forbidden_rail: "a forbidden payment method",
  injection_attempt: "instructions aimed at the assistant",
  owner_impersonation: "a claim to speak for the owner",
  bank_change: "new bank details",
  lookalike_domain: "a lookalike domain",
  amount_anomaly: "an unusual amount",
  new_sender: "a sender not on file",
  urgency: "pressure to pay fast",
  off_hours: "a late-night request",
};

/** The second sentence, for the most severe flag. */
const REASONS: Readonly<Record<RiskFlag, string>> = {
  forbidden_rail: "Gift cards, crypto and transfers to personal accounts are never used to pay vendors.",
  injection_attempt: "The message tries to instruct the assistant, so it is treated as data and ignored.",
  owner_impersonation: "The owner approves payments only with a one-time code or in ASI:One, never by message or voice.",
  bank_change:
    "Changed bank details are the most common sign of payment fraud, so they are confirmed with the vendor on the number already on file.",
  lookalike_domain: "A domain in the request imitates a known one.",
  // "does not fit" also covers a non-USD amount, which can't be compared with the range at all.
  amount_anomaly: "The amount does not fit this vendor's usual range.",
  new_sender: "The sender's phone or email is not on file.",
  urgency: "Pressure to pay quickly is a common scam tactic.",
  off_hours: "It arrived between 9 PM and 7 AM Pacific time.",
};

/** A plain lowercase hostname, so request text can't add a sentence, a "$" or markup. "" when it isn't one. */
function cleanDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const domain = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  const ok = /^[a-z0-9][a-z0-9.-]{0,251}[a-z0-9]$/.test(domain) && domain.includes(".") && !domain.includes("..");
  return ok ? domain : "";
}

/** "a", "a and b", "a, b and c" */
function joinList(items: readonly string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Exactly two sentences: the flags in FLAG_ORDER, then why the most severe one matters. */
export function explainRisk(args: { flags: readonly RiskFlag[]; lookalikeDomains: readonly string[] }): string {
  const flags = FLAG_ORDER.filter((flag) => args.flags.includes(flag));
  if (flags.length === 0) return NO_FLAGS;
  const top = flags[0];
  const domain = top === "lookalike_domain" ? args.lookalikeDomains.map(cleanDomain).find((d) => d !== "") : undefined;
  const reason = domain ? `The domain ${domain} imitates a known one.` : REASONS[top];
  return `${flags.length === 1 ? "Red flag" : "Red flags"}: ${joinList(flags.map((flag) => PHRASES[flag]))}. ${reason}`;
}
