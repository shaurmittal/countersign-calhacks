// The owner's allow and block lists, matched against one request (owner: P3). Pure, no Convex imports.
// Deny only tightens: any hit is R16 BLOCK. Trust ties one sender to one vendor, which satisfies R3 and
// nothing else, so a trust entry can never move money on its own: bank changes still need the callback,
// and the amount, invoice, limit and CRS checks still apply. The owner edits both lists on /owner with an
// authenticator code (convex/senderLists.ts). The loader passes only live entries, never removed or expired ones.
import type { DenyListHit, ListMatch, PaymentRequest } from "../types";
import { extractDomains } from "./lookalike";
import { digitsOnly, emailDomain, isSameOrSubdomain, normalizeEmail, normalizePhone } from "./text";
import type { BookListEntry } from "./types";

const ROUTING_DIGITS = 9;
const BANK_INPUT = /^\s*(\d{9})\s*[\s:/,-]\s*(\d{4,17})\s*$/;
const DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

/** "<routing>:<last 4 of the account>", the same pair a vendor record keeps (bankRouting, bankLast4). */
export function bankKey(routing: string, account: string): string {
  return `${digitsOnly(routing)}:${digitsOnly(account).slice(-4)}`;
}

/** A bare, lowercase host: no scheme, "www.", path, port or trailing dot. An email gives its domain. "" when invalid. */
export function normalizeDomain(raw: string): string {
  const fromEmail = emailDomain(raw);
  const host = (fromEmail || raw)
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[/?#]/, 1)[0]
    .replace(/:\d+$/, "")
    .replace(/^www\./, "")
    .replace(/\.+$/, "");
  return DOMAIN.test(host) ? host : "";
}

/**
 * The stored form of a list value, or null when it isn't valid for that kind of match:
 * a phone number's digits (a 10-digit US number gets its leading 1), a lowercase email, a bare domain,
 * or "<routing>:<last 4>" for a bank account typed as "021000021 55519921".
 */
export function normalizeListValue(match: ListMatch, raw: string): string | null {
  switch (match) {
    case "phone":
      return normalizePhone(raw) || null;
    case "email":
      return normalizeEmail(raw) || null;
    case "domain":
      return normalizeDomain(raw) || null;
    case "bank": {
      const m = raw.match(BANK_INPUT);
      return m ? bankKey(m[1], m[2]) : null;
    }
  }
}

/** The sender's address is this entry: same phone, same email, or an email at the domain or a subdomain. */
function senderMatches(entry: BookListEntry, fromAddress: string): boolean {
  switch (entry.match) {
    case "phone": {
      const phone = normalizePhone(fromAddress);
      return phone !== "" && phone === entry.value;
    }
    case "email": {
      const email = normalizeEmail(fromAddress);
      return email !== "" && email === entry.value;
    }
    case "domain": {
      const domain = emailDomain(fromAddress);
      return domain !== "" && isSameOrSubdomain(domain, entry.value);
    }
    case "bank":
      return false;
  }
}

/**
 * The requested account is this entry. The last 4 must match; the routing number must too when the request
 * gives one. Matching on the last 4 alone blocks more, never less, which is the safe direction for a deny list.
 */
function bankMatches(entry: BookListEntry, details: PaymentRequest["newBankDetails"]): boolean {
  const last4 = digitsOnly(details?.account ?? "").slice(-4);
  if (entry.match !== "bank" || last4.length < 4) return false;
  const [routing, entryLast4] = entry.value.split(":");
  const requested = digitsOnly(details?.routing ?? "");
  return entryLast4 === last4 && (requested.length !== ROUTING_DIGITS || requested === routing);
}

/** Deny entries the request hits, at most one hit per entry: the sender first, then the message, then the bank account. */
export function denyListHits(args: {
  fromAddress: string;
  rawContent?: string;
  request: PaymentRequest;
  lists: readonly BookListEntry[];
}): DenyListHit[] {
  const deny = args.lists.filter((e) => e.kind === "deny");
  if (deny.length === 0) return [];
  const messageDomains = args.rawContent ? extractDomains(args.rawContent) : [];
  const hits: DenyListHit[] = [];
  for (const entry of deny) {
    if (senderMatches(entry, args.fromAddress)) {
      hits.push({ entryId: entry.id, match: entry.match, source: "sender" });
    } else if (entry.match === "domain" && messageDomains.some((d) => isSameOrSubdomain(d, entry.value))) {
      hits.push({ entryId: entry.id, match: entry.match, source: "message" });
    } else if (bankMatches(entry, args.request.newBankDetails)) {
      hits.push({ entryId: entry.id, match: entry.match, source: "bank" });
    }
  }
  return hits;
}

/** The sender itself is on the deny list (its phone, email or email domain). Such a sender identifies no vendor. */
export function isOwnerDeniedSender(fromAddress: string, lists: readonly BookListEntry[]): boolean {
  return lists.some((e) => e.kind === "deny" && senderMatches(e, fromAddress));
}

/** The owner's trust list ties this sender to this vendor. A deny entry for the same sender wins at the caller. */
export function isTrustedSender(fromAddress: string, vendorId: string | null, lists: readonly BookListEntry[]): boolean {
  if (vendorId === null) return false;
  return lists.some((e) => e.kind === "trust" && e.vendorId === vendorId && senderMatches(e, fromAddress));
}
