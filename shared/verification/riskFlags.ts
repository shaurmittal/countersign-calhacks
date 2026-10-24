// Risk Analyst red flags and display score (owner: P3). Spec §6.3. Pure: no I/O, no clock.
// Flags never decide, but decide() may read some (R9 can't be overridden), so the text backstops stay narrow.
import type { PaymentRequest, PolicyConfig, RiskFlag } from "../types";
import type { BookVendor, SenderCheck } from "./types";

export const OFF_HOURS = Object.freeze({ timeZone: "America/Los_Angeles", startHour: 21, endHour: 7 } as const);

/** Most severe first. explainRisk lists flags in this order and explains the first one. */
export const FLAG_ORDER: readonly RiskFlag[] = Object.freeze([
  "forbidden_rail",
  "injection_attempt",
  "owner_impersonation",
  "bank_change",
  "lookalike_domain",
  "amount_anomaly",
  "new_sender",
  "urgency",
  "off_hours",
]);

/** Display-only weights for riskScore. */
export const FLAG_WEIGHTS: Readonly<Record<RiskFlag, number>> = Object.freeze({
  forbidden_rail: 50,
  injection_attempt: 45,
  owner_impersonation: 40,
  bank_change: 35,
  lookalike_domain: 35,
  amount_anomaly: 20,
  new_sender: 15,
  urgency: 15,
  off_hours: 5,
});

const HOUR_MS = 3_600_000;

/** UTC midnight on the nth Sunday of a month (month is 0-based). */
function nthSundayUtc(year: number, month: number, n: number): number {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0 = Sunday
  return Date.UTC(year, month, 1 + ((7 - firstWeekday) % 7) + 7 * (n - 1));
}

/**
 * Computed by hand because the Convex runtime may lack time-zone data. US rules since 2007: PDT (UTC-7) from
 * 10:00 UTC on the second Sunday of March to 09:00 UTC on the first Sunday of November (2 AM local), PST otherwise.
 */
export function pacificUtcOffsetHours(epochMs: number): -7 | -8 {
  const year = new Date(epochMs).getUTCFullYear();
  const pdtStart = nthSundayUtc(year, 2, 2) + 10 * HOUR_MS;
  const pdtEnd = nthSundayUtc(year, 10, 1) + 9 * HOUR_MS;
  return epochMs >= pdtStart && epochMs < pdtEnd ? -7 : -8;
}

/** Hour of the day in Pacific time, 0-23. NaN for an invalid timestamp, which is then never off-hours. */
export function pacificHour(epochMs: number): number {
  return new Date(epochMs + pacificUtcOffsetHours(epochMs) * HOUR_MS).getUTCHours();
}

/** 9 PM to 7 AM Pacific on any day. Weekends aren't flagged, because the demo runs on a Sunday morning. */
export function isOffHours(epochMs: number): boolean {
  const hour = pacificHour(epochMs);
  return hour >= OFF_HOURS.startHour || hour < OFF_HOURS.endHour;
}

/**
 * Spec R4, shared with P1: outside the range by more than pct, so a bound itself is fine. An amount that is zero,
 * negative or not finite, or a range or pct that isn't finite, can't be checked, so it counts as anomalous.
 */
export function isAmountAnomalous(amountCents: number, range: readonly [number, number], pct: number): boolean {
  const [min, max] = range;
  if (![amountCents, min, max, pct].every(Number.isFinite) || amountCents <= 0) return true;
  return amountCents < min * (1 - pct) || amountCents > max * (1 + pct);
}

// Text backstops. The message is untrusted data from a possible scammer: it is scanned, never followed, and a flag
// only makes the system more careful. Every pattern is linear: bounded gaps and no nested quantifiers. A gap such as
// [^.,;:!?()\u2013\u2014\n]{0,25} stays inside one clause, so "the account on file, new invoice" doesn't join up.

/**
 * Curly apostrophes become ' (phones send "It\u2019s"), invisible characters go so they can't split a word, digit
 * separators go so "$2,000.00" doesn't end a clause, and runs of spaces collapse so patterns can use one space.
 */
function normalize(raw: string): string {
  return raw
    .replace(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, "")
    .replace(/[\u2018\u2019\u201b\u02bc\u2032\uff07`\u00b4]/g, "'")
    .replace(/(\d)[.,](?=\d)/g, "$1")
    .replace(/[^\S\n]+/g, " ");
}

function matchesAny(patterns: readonly RegExp[], rawContent: string): boolean {
  const text = normalize(rawContent);
  return patterns.some((pattern) => pattern.test(text));
}

const BANK_CHANGE_PATTERNS: readonly RegExp[] = [
  // "our bank changed", "account details have been updated", but not "our bank details haven't changed"
  /\b(?:bank(?:s|ing)?|accounts?|routing|direct deposit|(?:payment|payee|wire|remittance) (?:details|info|information|instructions))\b[^.,;:!?()\u2013\u2014\n]{0,25}(?<!(?:\bnot|\bnever|n't) )\b(?:chang(?:e|ed|es|ing)|updated|switched|moved|different)\b/i,
  // "new bank account", "updated banking details", "I switched banks", "update my direct deposit"
  /\b(?:new|different|updat(?:e|ed|ing)|chang(?:e|ed|ing)|switch(?:ed|ing)?|mov(?:e|ed|ing))\b(?! (?:me|us)\b)[^.,;:!?()\u2013\u2014\n]{0,12}\b(?:bank(?:s|ing)?|accounts?|routing|direct deposit|(?:payment|payee|wire|remittance) (?:details|info|information|instructions))\b/i,
  // Paying through an app or a cash-pickup service instead of the bank on file. Shown, not a hard stop: the
  // Payer only ever pays the bank on file, and R9 (which no one can override) is kept for its own list.
  /\b(?:zelle|venmo|cash ?app|western union|money ?gram)\b/i,
];

/** bankMatches is false for details that differ from the file, or that have no vendor to match. */
export function detectBankChange(request: PaymentRequest, rawContent: string, bankMatches: boolean | null): boolean {
  if (bankMatches === false) return true;
  if (request.requestedAction === "change_bank" || request.requestedAction === "update_payroll") return true;
  return matchesAny(BANK_CHANGE_PATTERNS, rawContent);
}

const URGENCY_PATTERNS: readonly RegExp[] = [
  // Time pressure, but not "this isn't urgent"
  /(?<!(?:\bnot|n't) )\b(?:urgent(?:ly)?|asap|immediately|right (?:away|now)|today|tonight|eod|end of (?:the )?day|before my flight|boarding)\b/i,
  /\bwithin [a-z0-9 ]{0,15}(?:hours?|hrs?|minutes?|mins?)\b/i,
  // Deadlines
  /\b(?:last chance|final (?:notice|warning|reminder)|overdue|past due|deadline|time[- ]sensitive)\b/i,
  // Threats: "or your servers shut down"
  /\b(?:shut[- ]?(?:down|off)|cut[- ]?off|suspend(?:ed|ion)?|terminat(?:e|ed|ion)|disconnect(?:ed|ion)?|late fees?|penalt(?:y|ies)|legal action|or else)\b/i,
  // "approve the payment now"
  /\b(?:pay(?:ment|ments)?|send|wire|transfer|approve|process)\b[^.,;:!?()\u2013\u2014\n]{0,25}\bnow\b/i,
];

export function detectUrgency(request: PaymentRequest, rawContent: string): boolean {
  return request.urgencyClaims.length > 0 || matchesAny(URGENCY_PATTERNS, rawContent);
}

const FORBIDDEN_RAIL_PATTERNS: readonly RegExp[] = [
  // "Buy 5 $200 Apple gift cards", "send the gift card codes"; a "gift card design project" is ordinary work
  /\b(?:buy(?:ing)?|purchas(?:e|ed|ing)|get(?:ting)?|grab|need|order(?:ing)?|pick up|send(?:ing)?|load(?:ing)?|pay(?:ment)? (?:in|with|by|via|using))\b[^.,;:!?()\u2013\u2014\n]{0,20}\bgift ?cards?\b(?! (?:design|project|program|campaign|artwork|printing))/i,
  /\bgift ?cards? (?:codes?|pins?|numbers?)\b|\b(?:codes?|pins?|numbers?) (?:on|from|off|of) (?:the |those |these |your )?gift ?cards?\b/i,
  // Crypto, but not an invoice number such as "BTC-12"
  /\b(?:bitcoins?|btc|ethereum|usdt|usdc|tether|crypto(?:currency|currencies)?|coinbase|binance)\b(?![- ]?\d)|\bwallet address\b/i,
  // R9's "wire to a personal account", but not "the business account, not my personal account"
  /(?<!(?:\bnot|\bnever|\bno|n't) (?:(?:to|into|in|from) )?(?:(?:my|a|the|our|your|any) )?)\bpersonal (?:bank |checking |savings )?accounts?\b/i,
];

/**
 * Spec R9: gift cards, crypto or a personal account. decide() blocks on it and even the owner can't override,
 * so a false positive here refuses a real bill for good: keep these patterns to R9's own list.
 */
export function detectForbiddenRail(request: PaymentRequest, rawContent: string): boolean {
  if (request.requestedAction === "gift_cards" || request.requestedAction === "crypto") return true;
  return matchesAny(FORBIDDEN_RAIL_PATTERNS, rawContent);
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/** "It's Priya", "Priya here", "on behalf of the owner", "your boss asked me". The owner's name is escaped. */
function ownerClaimPatterns(ownerName: string | null): RegExp[] {
  const parts = (ownerName ?? "").trim().split(/\s+/).filter(Boolean).map((p) => p.replace(REGEX_SPECIALS, "\\$&"));
  const names = parts.length > 1 ? [parts.join(" "), parts[0]] : parts;
  // "the owner of Pixel & Pine" is a vendor introducing itself, and "this is Priya's invoice" claims nothing, but
  // "this is Priya's new number" does. (?<![\w']) and (?![\w']) stand in for \b, which fails beside "é" in "José".
  const generic = ["the owner(?! of)", "your boss", "your ceo", "your founder"];
  const possessive = "(?:'s (?:assistant|secretary|office|new number|new phone|number|phone|cell))?";
  const who = `(?:${[...names, ...generic].join("|")})${possessive}(?![\\w'])`;
  return [
    new RegExp(`\\b(?:it'?s|it is|this is|i'?m|i am) (?:me |me, )?${who}`, "i"),
    // "Priya here", but not the greeting in "Hi Priya here is the invoice"
    new RegExp(`(?<!\\b(?:hi|hey|hello|dear|thanks) )(?<![\\w'])${who} (?:here|speaking)(?![\\w'])(?! is| are)`, "i"),
    new RegExp(`\\bon behalf of ${who}`, "i"),
    new RegExp(`(?<![\\w'])${who} (?:has |had )?(?:asked|told|wants|wanted|needs|instructed|authori[sz]ed) (?:me|us)\\b`, "i"),
  ];
}

/** Spec R11: someone other than the owner claims to be, or to speak for, the owner. */
export function detectOwnerImpersonation(
  request: PaymentRequest,
  rawContent: string,
  senderIsOwner: boolean,
  ownerName: string | null,
): boolean {
  if (senderIsOwner) return false;
  // Lumen Labs is a solo company, so a cofounder claim is an owner claim too.
  if (request.claimedSenderRole === "owner" || request.claimedSenderRole === "cofounder") return true;
  return matchesAny(ownerClaimPatterns(ownerName), rawContent);
}

const INJECTION_PATTERNS: readonly RegExp[] = [
  // "Ignore all previous instructions", but not "don't forget the payment instructions" or "ignore the late fee"
  /(?<!\b(?:don't|dont|do not|never) )\b(?:ignore|disregard|forget|override|bypass)\b[^.,;:!?()\u2013\u2014\n]{0,25}(?<!\b(?:payment|wire|bank|banking|remittance|invoice|billing|shipping|delivery|refund|return|privacy|cancellation) )\b(?:instructions?|prompts?|directives?|programming|rules?|polic(?:y|ies)|guardrails?|safety|(?:security|verification|fraud) checks?)\b/i,
  // Talking to the model directly; "as an AI startup" and "you are now past due" are ordinary mail
  /\bsystem prompt|\bnew instructions ?:|\bpretend (?:that )?you(?: are|'re)\b|\bas an ai(?:,| (?:model|language model|assistant|system|you)\b)/i,
  /\byou(?: are|'re) now (?:dan\b|an? (?:ai|assistant|bot|agent|model)\b|an? [a-z]{1,20} (?:ai|assistant|bot|agent|model)\b|my (?:assistant|agent|bot)\b|[a-z]{0,20}(?:bot|gpt)\b|unrestricted|unfiltered|jailbroken|free (?:from|of)\b|(?:authori[sz]ed|allowed|permitted) to\b|acting as\b)/i,
  /\b(?:developer|admin|dan|god) mode\b|\bjailbr(?:eak|oke)/i,
  // Chat-template role tags: <system>, <|im_start|>, [INST], <<SYS>>, ### Instruction, "System:" opening a line
  /<\/?(?:system|assistant|user|instructions?)>|<\|[a-z_]{1,20}\|>|\[\/?inst\]|<<\/?sys>>|#{3,6} ?(?:instructions?|system)\b|(?:^|\n) ?(?:system|assistant) ?:/i,
  // Telling the assistant to skip verification
  /\b(?:approve|authori[sz]e|release)\b[^.,;:!?()\u2013\u2014\n]{0,30}\b(?:automatically|without (?:any |a |the )?(?:verification|verifying|checking|checks?|calls?|calling|callbacks?|approval|confirmation))\b|\bautomatically (?:approve|authori[sz]e|release)\b/i,
];

export function detectInjection(request: PaymentRequest, rawContent: string): boolean {
  return request.injectionAttempt || matchesAny(INJECTION_PATTERNS, rawContent);
}

/** Everything the Risk Analyst reads. The vendor match, bank comparison and lookalike check arrive precomputed. */
export type RiskSignals = {
  request: PaymentRequest;
  rawContent: string;
  receivedAt: number; // epoch ms
  vendor: BookVendor | null; // the matched vendor, if any
  bankMatches: boolean | null; // compareBank() result; null = the request carried no bank details
  sender: SenderCheck;
  lookalikeDomains: readonly string[];
  ownerName: string | null;
  policy: PolicyConfig;
};

function hasAmountAnomaly(request: PaymentRequest, vendor: BookVendor | null, policy: PolicyConfig): boolean {
  if (!vendor || request.amountCents === null) return false;
  // A non-USD amount can't be compared with the USD range (spec §8.1).
  if (request.currency.trim().toUpperCase() !== "USD") return true;
  return isAmountAnomalous(request.amountCents, vendor.typicalAmountRange, policy.amountAnomalyPct);
}

/** Every raised flag once, in FLAG_ORDER. */
export function computeFlags(signals: RiskSignals): RiskFlag[] {
  const { request, rawContent, vendor, sender } = signals;
  const senderOnFile = sender.isOwner || (vendor ? sender.onMatchedVendorFile : sender.onAnyVendorFile);
  // One entry per flag, so the compiler catches a RiskFlag that has no rule.
  const raised: Record<RiskFlag, boolean> = {
    forbidden_rail: detectForbiddenRail(request, rawContent),
    injection_attempt: detectInjection(request, rawContent),
    owner_impersonation: detectOwnerImpersonation(request, rawContent, sender.isOwner, signals.ownerName),
    bank_change: detectBankChange(request, rawContent, signals.bankMatches),
    lookalike_domain: signals.lookalikeDomains.length > 0,
    amount_anomaly: hasAmountAnomaly(request, vendor, signals.policy),
    new_sender: sender.knownBad || !senderOnFile,
    urgency: detectUrgency(request, rawContent),
    off_hours: isOffHours(signals.receivedAt),
  };
  return FLAG_ORDER.filter((flag) => raised[flag]);
}

/** Display only, never decides: the sum of the unique flags' weights, capped at 100. */
export function riskScore(flags: readonly RiskFlag[]): number {
  let total = 0;
  for (const flag of new Set(flags)) total += FLAG_WEIGHTS[flag] ?? 0;
  return Math.min(100, total);
}
