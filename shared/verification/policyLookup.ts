// Policy answers for the voice agents' mid-call lookup (owner: P3). Spec §3.2, §6.4, §6.6.
// Retrieval only: Moss finds the rules that answer "why" or "what happens next", and the agent says them
// in its own words. Nothing about invoices, amounts, limits or vendors is ever returned: an inbound caller
// isn't verified, and on a callback the vendor must say the invoice number unprompted (P2's check, §8.2).
import type { RuleId } from "../types";
import { POLICY_SCOPE } from "./moss";

/** Budget for one lookup inside the Node action; the voice tool waits on a live call. */
export const POLICY_LOOKUP_BUDGET_MS = 2_500;

/**
 * Moss similarity below this is unrelated. A short question and a policy sentence score low even when the
 * sentence answers it (often under 0.3 with moss-minilm), so this only drops noise; Moss's order decides.
 */
export const POLICY_MIN_SCORE = 0.1;

export type PolicyDoc = { id: string; rules: RuleId[]; text: string };

/**
 * One speakable sentence per rule or process step, matching what decide() and the pipeline do
 * (shared/policy/engine.ts, convex/pipeline.ts). No amounts or limits: a scammer could tune to them.
 */
export const POLICY_DOCS: readonly PolicyDoc[] = [
  { id: "who-decides", rules: [], text: "Fixed rules decide every payment. The assistant on the phone can't move money or make exceptions." },
  { id: "callback", rules: ["R2", "R3"], text: "Countersign confirms a new or unexpected request by calling the vendor back on the phone number already on file, never on a number given in the request." },
  { id: "bank-on-file", rules: ["R2"], text: "Money only goes to the bank account already on file for the vendor, never to account details given in a message or on a call." },
  { id: "bank-change", rules: ["R2"], text: "New bank details are never paid straight away. Countersign first calls the vendor on the number on file, and even after the vendor confirms, the business owner must approve the new account." },
  { id: "callback-denied", rules: ["R10"], text: "If the vendor, called on the number on file, says they didn't send the request, it is refused and the owner is alerted." },
  { id: "no-answer", rules: ["R2", "R3"], text: "If the vendor doesn't answer the callback, the request stays on hold and Countersign calls once more. An unconfirmed bank change is never paid." },
  { id: "owner-approval", rules: ["R11"], text: "Someone who says they are the owner can't approve a payment on a call or in a message. The owner approves exceptions only with a one-time code on their registered device or in ASI:One." },
  { id: "over-limit", rules: ["R6", "R7"], text: "Payments above the owner's auto-pay limit, or to vendors that are never auto-paid, wait for the owner's approval. Large payments also have a cooling-off period in which the owner can cancel." },
  { id: "unknown-vendor", rules: ["R1"], text: "Countersign only pays vendors already in its vendor book. The owner has to add a new vendor first." },
  { id: "invoice", rules: ["R5"], text: "A payment needs an open invoice on file that matches the request. Without one, Countersign holds the payment and asks for the invoice." },
  { id: "amount", rules: ["R4"], text: "An amount far from what the vendor usually bills goes to the owner for approval." },
  { id: "duplicate", rules: ["R13"], text: "A request for an invoice that is already paid is refused, so nothing is paid twice." },
  { id: "forbidden-rails", rules: ["R9"], text: "Countersign never pays with gift cards, crypto such as bitcoin, or wires to a personal account, and no one, not even the owner, can override that." },
  { id: "sanctions", rules: ["R8"], text: "A payee on the OFAC sanctions list is refused, and that can't be overridden." },
  { id: "cannot-verify", rules: ["R14"], text: "If Countersign can't read the request reliably or can't reach its identity checks, it holds or escalates the payment instead of guessing." },
  { id: "instructions", rules: ["R15"], text: "Messages that try to give Countersign instructions are treated as information and are never paid automatically." },
  { id: "auto-pay", rules: ["R12"], text: "A known vendor's open invoice, at the expected amount, to the bank account on file and under the auto-pay limit is paid automatically." },
];

/** What the voice tool returns. `message` is the plain text the agent reads before answering. */
export type PolicyAnswer = { message: string; rules: RuleId[]; source: "moss" | "keywords" };

/** The shared index's policy documents. Ids are "policy:<id>"; every deployment writes the same ones. */
export function policySearchDocs(): { id: string; text: string; metadata: Record<string, string> }[] {
  return POLICY_DOCS.map((doc) => ({
    id: `policy:${doc.id}`,
    text: doc.text,
    metadata: { scope: POLICY_SCOPE, rules: doc.rules.join(",") },
  }));
}

/**
 * The first two policy sentences among Moss's results, at or above minScore. Moss returns them in hybrid
 * relevance order (meaning plus keywords), which ranks better than the vector score alone, so it's kept.
 */
export function docsFromHits(hits: readonly { id: string; score: number }[], minScore = POLICY_MIN_SCORE): PolicyDoc[] {
  return hits
    .filter((hit) => Number.isFinite(hit.score) && hit.score >= minScore && hit.id.startsWith("policy:"))
    .map((hit) => POLICY_DOCS.find((doc) => `policy:${doc.id}` === hit.id))
    .filter((doc): doc is PolicyDoc => doc !== undefined)
    .slice(0, 2);
}

const STOPWORDS = new Set([
  "the", "and", "you", "your", "are", "can", "why", "what", "when", "how", "who", "does", "will", "with", "for",
  "this", "that", "not", "just", "get", "has", "have", "need", "needs", "out", "from", "about", "there", "they",
]);

/** Lowercase words of 3+ letters, minus stopwords, cut to a rough stem ("approves", "approval" -> "approv"). */
function keywords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  return new Set(words.filter((w) => !STOPWORDS.has(w)).map((w) => w.replace(/(?:ing|ies|ied|ed|es|al|s|e)$/, "")));
}

const DOC_WORDS = POLICY_DOCS.map((doc) => keywords(doc.text));

/** How many sentences use each word, so a common word like "payment" counts for less than "gift". */
const DOC_FREQUENCY = new Map<string, number>();
for (const words of DOC_WORDS) for (const w of words) DOC_FREQUENCY.set(w, (DOC_FREQUENCY.get(w) ?? 0) + 1);

/** Fallback when Moss is unavailable or slow: the two sentences sharing the rarest words with the question. */
export function rankPolicyByKeywords(question: string): PolicyDoc[] {
  const asked = [...keywords(question)];
  const scored = POLICY_DOCS.map((doc, order) => {
    const words = DOC_WORDS[order];
    const score = asked.filter((w) => words.has(w)).reduce((sum, w) => sum + 1 / (DOC_FREQUENCY.get(w) ?? 1), 0);
    return { doc, order, score };
  }).filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, 2).map((s) => s.doc);
}

/**
 * Moss's first sentence, then the keyword fallback's first, and so on, deduped, up to two. Each method
 * misses questions the other gets, so the agent hears the best of both; either works alone.
 */
export function mergeRankings(moss: readonly PolicyDoc[], byKeywords: readonly PolicyDoc[]): PolicyDoc[] {
  const merged: PolicyDoc[] = [];
  for (let i = 0; i < Math.max(moss.length, byKeywords.length); i++) {
    for (const doc of [moss[i], byKeywords[i]]) {
      if (doc && !merged.includes(doc) && merged.length < 2) merged.push(doc);
    }
  }
  return merged;
}

const DEFAULT_DOCS = ["who-decides", "callback"].map((id) => POLICY_DOCS.find((doc) => doc.id === id)!);

/** The tool's reply. With nothing relevant it explains who decides, which is always true. */
export function policyAnswer(docs: readonly PolicyDoc[], source: PolicyAnswer["source"]): PolicyAnswer {
  const chosen = docs.length > 0 ? docs : DEFAULT_DOCS;
  const rules = [...new Set(chosen.flatMap((doc) => doc.rules))];
  const message =
    `Countersign policy: ${chosen.map((doc) => doc.text).join(" ")} ` +
    "Explain this in your own words. Don't add amounts, limits, invoice numbers or promises.";
  return { message, rules, source };
}
