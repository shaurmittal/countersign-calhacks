// Vendor-book name matching and exact sender checks for the Vendor Verifier (owner: P3). Spec §6.2.
// Pure: a match only says which record to check against, and an address on file is not proof of the sender (§8.2).
import { emailDomain, isPhoneLike, isSameOrSubdomain, normalizeEmail, normalizePhone, similarity } from "./text";
import type { BookOwner, BookVendor, SearchHit, SenderCheck, VendorMatch, VerificationBook } from "./types";

export const MATCH_THRESHOLD = 0.8;
export const SENDER_MATCH_CONFIDENCE = 0.9;

/** Vendors scoring within this of the best are a tie: the name alone can't tell them apart. */
const TIE_MARGIN = 0.02;
/** Float slack, so a gap of exactly 0.02 (computed as 0.020000000000000018) still counts as a tie. */
const EPSILON = 1e-9;

const STOPWORDS = new Set(["the", "and", "of", "a", "an", "mr", "mrs", "ms", "dr"]);

const LEGAL_SUFFIXES = new Set([
  "inc", "incorporated", "llc", "llp", "lllp", "pllc", "pc", "ltd", "limited",
  "co", "corp", "corporation", "company", "plc", "gmbh",
]);

/** Words that describe a business without naming it, so "Cloud" or "Legal" alone never matches a vendor. */
const GENERIC = new Set([
  "design", "designs", "designer", "studio", "studios", "cloud", "hosting", "host", "legal", "law", "lawyers",
  "attorneys", "services", "service", "consulting", "consultants", "group", "solutions", "labs", "lab", "tech",
  "technology", "technologies", "software", "systems", "digital", "media", "creative", "agency", "partners",
  "associates", "billing", "invoice", "invoices", "accounts", "accounting", "payment", "payments", "team",
  "support", "dept", "department", "office", "global", "international", "web", "online", "net", "us", "usa",
]);

/** Lowercase ASCII words: accents stripped, "&" read as "and", a possessive "'s" dropped, punctuation as spaces. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]s(?![a-z0-9])/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Tokens of normalizeName(s) without stopwords or legal suffixes: "The Harbor Legal, LLP" -> ["harbor", "legal"]. */
export function coreTokens(s: string): string[] {
  return core(normalizeName(s));
}

function core(normalized: string): string[] {
  return normalized.split(" ").filter((t) => t !== "" && !STOPWORDS.has(t) && !LEGAL_SUFFIXES.has(t));
}

function isSubset(small: ReadonlySet<string>, large: ReadonlySet<string>): boolean {
  return [...small].every((t) => large.has(t));
}

/** At least one token that can name a business on its own: 3+ characters and not generic. */
function hasDistinctive(tokens: ReadonlySet<string>): boolean {
  return [...tokens].some((t) => t.length >= 3 && !GENERIC.has(t));
}

function withoutGeneric(tokens: ReadonlySet<string>): Set<string> {
  return new Set([...tokens].filter((t) => !GENERIC.has(t)));
}

/**
 * How well a claimed name fits one book name or alias, 0..1. The first rule that applies wins: equal names 1,
 * the same letters once spaces and suffixes go 0.97, one side's tokens inside the other's 0.85-0.95, the same
 * with generic words set aside 0.85-0.95, else similarity.
 */
export function nameScore(claimed: string, candidate: string): number {
  const a = normalizeName(claimed);
  const b = normalizeName(candidate);
  if (a === "" || b === "") return 0;
  if (a === b) return 1;
  const claimedCore = core(a);
  const candidateCore = core(b);
  const claimedCompact = claimedCore.join("");
  const candidateCompact = candidateCore.join("");
  if (claimedCompact !== "" && claimedCompact === candidateCompact) return 0.97;
  const c = new Set(claimedCore);
  const v = new Set(candidateCore);
  if (isSubset(c, v) && hasDistinctive(c)) return 0.85 + 0.1 * (c.size / v.size);
  // Two tokens at least, so a one-word alias ("Sam") can't match inside a longer name ("Sam's Club").
  if (v.size >= 2 && isSubset(v, c) && hasDistinctive(v)) return 0.85 + 0.1 * (v.size / c.size);
  // Generic words don't name anyone, so set them aside: "Northwind billing" fits "Northwind",
  // "Harbor billing" fits "Harbor Legal". Every other claimed word must still be the vendor's.
  const cNamed = withoutGeneric(c);
  const vNamed = withoutGeneric(v);
  if (hasDistinctive(cNamed) && isSubset(cNamed, vNamed)) return 0.85 + 0.1 * (cNamed.size / vNamed.size);
  return similarity(claimedCompact, candidateCompact); // 0 when either side is empty
}

/** One sender against one address on file: phones by number, emails case-insensitively, anything else exactly. */
function sameAddress(fromAddress: string, onFile: string): boolean {
  const phone = normalizePhone(fromAddress);
  if (phone) return phone === normalizePhone(onFile);
  const email = normalizeEmail(fromAddress);
  if (email) return email === normalizeEmail(onFile);
  const raw = fromAddress.trim().toLowerCase();
  return raw !== "" && raw === onFile.trim().toLowerCase();
}

/**
 * The sender is on this vendor's record: its phone, an email on file, or any address at one of its domains or their
 * subdomains. Exact checks only. Caller ID and email From can be spoofed, so this is not proof (§8.2).
 */
export function senderMatchesVendor(fromAddress: string, vendor: BookVendor): boolean {
  if (isPhoneLike(fromAddress)) return sameAddress(fromAddress, vendor.phoneOnFile);
  if (normalizeEmail(fromAddress) !== "") {
    const domain = emailDomain(fromAddress);
    return (
      vendor.emailsOnFile.some((e) => sameAddress(fromAddress, e)) ||
      vendor.domains.some((d) => isSameOrSubdomain(domain, d))
    );
  }
  // Anything else, such as a Fetch.ai agent address, has to equal an address on file.
  return [vendor.phoneOnFile, ...vendor.emailsOnFile].some((onFile) => sameAddress(fromAddress, onFile));
}

/** The owner's registered phone, OTP phone or email. Caller ID can be spoofed, so this is never an approval (R11). */
export function isOwnerAddress(fromAddress: string, owner: BookOwner | null): boolean {
  if (!owner) return false;
  const phone = normalizePhone(fromAddress);
  if (phone) return phone === normalizePhone(owner.phone) || phone === normalizePhone(owner.otpPhone);
  const email = normalizeEmail(fromAddress);
  return email !== "" && email === normalizeEmail(owner.email);
}

/** On any vendor's knownBadSenders list, for example a sender whose request the vendor denied on callback (R10). */
export function isKnownBadSender(fromAddress: string, vendors: readonly BookVendor[]): boolean {
  return vendors.some((v) => (v.knownBadSenders ?? []).some((bad) => sameAddress(fromAddress, bad)));
}

type Candidate = { vendor: BookVendor; score: number; entry: string };

/**
 * Best nameScore over the vendor's name and aliases. Ties go to the entry spelled as claimed, then book order.
 * A search hit can lift the score but never lower it, so the in-memory match stays the fallback.
 */
function scoreVendor(claimed: string, vendor: BookVendor, hitScore: number): Candidate {
  const asTyped = claimed.trim().toLowerCase();
  let best: Candidate = { vendor, score: -1, entry: vendor.name };
  for (const entry of [vendor.name, ...vendor.aliases]) {
    const score = nameScore(claimed, entry);
    if (score > best.score || (score === best.score && entry.trim().toLowerCase() === asTyped)) {
      best = { vendor, score, entry };
    }
  }
  if (hitScore > best.score) best = { vendor, score: hitScore, entry: vendor.name };
  return best;
}

/** Best hit score per vendor id, clamped to 0..1. Non-finite scores are dropped. */
function hitScores(searchHits: readonly SearchHit[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const hit of searchHits) {
    if (!Number.isFinite(hit.score)) continue;
    const score = Math.min(1, Math.max(0, hit.score));
    scores.set(hit.vendorId, Math.max(scores.get(hit.vendorId) ?? 0, score));
  }
  return scores;
}

function noMatch(): VendorMatch {
  return { vendorId: null, confidence: 0, method: "none", matchedOn: null };
}

function matchByName(
  claimed: string,
  fromAddress: string,
  vendors: readonly BookVendor[],
  searchHits: readonly SearchHit[],
): VendorMatch {
  const hits = hitScores(searchHits);
  // sort is stable, so equal scores keep book order.
  const ranked = vendors.map((v) => scoreVendor(claimed, v, hits.get(v.id) ?? 0)).sort((x, y) => y.score - x.score);
  const best = ranked[0];
  if (!best || best.score < MATCH_THRESHOLD) return noMatch();
  const top = best.score;
  const tied = ranked.filter((c) => c.score >= MATCH_THRESHOLD && top - c.score <= TIE_MARGIN + EPSILON);
  let pick = best;
  if (tied.length > 1) {
    // Only the sender's record can settle a near-tie, and a known-bad sender identifies nobody.
    const onFile = isKnownBadSender(fromAddress, vendors)
      ? []
      : tied.filter((c) => senderMatchesVendor(fromAddress, c.vendor));
    if (onFile.length !== 1) return noMatch();
    pick = onFile[0];
  }
  return {
    vendorId: pick.vendor.id,
    confidence: Math.round(pick.score * 100) / 100,
    method: "name",
    matchedOn: pick.entry,
  };
}

/**
 * Which vendor the request refers to. A claimed name decides on its own and never falls back to the sender.
 * Only a request with no name is matched by sender, and a known-bad sender identifies nobody. searchHits
 * (from the Moss index, once wired) only refine a name match; ids not in the book are ignored.
 */
export function matchVendor(
  claimedName: string | null,
  fromAddress: string,
  vendors: readonly BookVendor[],
  searchHits: readonly SearchHit[] = [],
): VendorMatch {
  if (claimedName !== null && normalizeName(claimedName) !== "") {
    return matchByName(claimedName, fromAddress, vendors, searchHits);
  }
  if (isKnownBadSender(fromAddress, vendors)) return noMatch();
  const onFile = vendors.filter((v) => senderMatchesVendor(fromAddress, v));
  if (onFile.length !== 1) return noMatch();
  return { vendorId: onFile[0].id, confidence: SENDER_MATCH_CONFIDENCE, method: "sender", matchedOn: null };
}

/** Raw facts about the sender. knownBad is not folded into the other fields: the caller does that. */
export function checkSender(
  fromAddress: string,
  vendor: BookVendor | null,
  book: Pick<VerificationBook, "vendors" | "owner">,
): SenderCheck {
  return {
    isOwner: isOwnerAddress(fromAddress, book.owner),
    knownBad: isKnownBadSender(fromAddress, book.vendors),
    onMatchedVendorFile: vendor ? senderMatchesVendor(fromAddress, vendor) : false,
    onAnyVendorFile: book.vendors.some((v) => senderMatchesVendor(fromAddress, v)),
  };
}
