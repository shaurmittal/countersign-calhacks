// Lookalike domains for the Risk Analyst's lookalike_domain flag (owner: P3). Spec §1 item 3, §6.3.
// Pure: no I/O, no clock. Message text may come from a scammer, so it is only scanned, never acted on.
import { emailDomain, isSameOrSubdomain, osaDistance } from "./text";
import type { BookVendor } from "./types";

/** Commonly impersonated billing, SaaS, bank and government domains. They and their subdomains are never lookalikes. */
export const WELL_KNOWN_DOMAINS: readonly string[] = [
  "amazon.com", "aws.amazon.com", "amazonaws.com", "amazonses.com", "amazon.co.uk", "amazon.ca", "amazon.de",
  "google.com", "googleapis.com", "workspace.google.com", "gmail.com", "google.co.uk", "google.ca",
  "microsoft.com", "microsoftonline.com", "office.com", "office365.com", "outlook.com", "live.com",
  "apple.com", "icloud.com", "paypal.com", "stripe.com", "intuit.com", "quickbooks.com",
  "docusign.com", "docusign.net", "dropbox.com", "adobe.com", "github.com", "slack.com", "zoom.us",
  "gusto.com", "brex.com", "ramp.com", "mercury.com", "chase.com", "wellsfargo.com", "bankofamerica.com",
  "yahoo.com", "proton.me", "irs.gov", "ftb.ca.gov", "sos.ca.gov", "uspto.gov",
];

/** Labels a scammer imitates. Each book adds its vendors' and owner's domain names to these. */
export const BRAND_LABELS: readonly string[] = [
  "aws", "amazon", "amazonaws", "google", "gmail", "microsoft", "outlook", "office365", "apple", "icloud",
  "paypal", "stripe", "intuit", "quickbooks", "docusign", "dropbox", "adobe", "github", "gusto",
  "wellsfargo", "bankofamerica", "irs", "ftb", "uspto",
];

const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "co.in",
  "com.br", "com.mx", "com.cn", "ca.gov", "ny.gov",
]);

/** "invoice.pdf" is a file name, not a domain. */
const FILE_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "png", "jpg", "jpeg", "gif", "zip",
]);

/**
 * Latin, Cyrillic and Greek letters are kept, so a homograph typed directly (pаypal.com, Cyrillic а) can be
 * flagged. Other scripts end a run, so a domain glued to Chinese text ("请付款给northwind.com") still reads.
 */
const LABEL = /^[\p{sc=Latin}\p{sc=Cyrillic}\p{sc=Greek}\p{N}-]+$/u;
/** ASCII letters only, so amounts ("4,800.00"), versions ("1.2") and other scripts' sentences aren't domains. */
const TLD = /^(?:[a-z]{2,24}|xn--[a-z0-9-]+)$/;
/** "Amazon.Please pay": a capitalized word after a period is a missing space, not a TLD. */
const SENTENCE_BREAK = /\.[A-Z][a-z]+$/;

/** Characters that pass for others at a glance (g00gle, paypa1). */
const LOOKALIKE_CHARS: Record<string, string> = {
  "0": "o", "1": "l", i: "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
};

/** s without `chars` at its end, and at its start too when `bothEnds`. A loop: /[.-]+$/ backtracks quadratically. */
function trimChars(s: string, chars: string, bothEnds = false): string {
  let start = 0;
  let end = s.length;
  while (bothEnds && start < end && chars.includes(s[start])) start++;
  while (end > start && chars.includes(s[end - 1])) end--;
  return s.slice(start, end);
}

/** Lowercased, without a trailing dot or a leading "www.". */
function normalizeHost(host: string): string {
  return trimChars(host.trim().toLowerCase(), ".").replace(/^www\./, "");
}

/** The normalized domain, or "" when the text isn't one. */
function asDomain(raw: string): string {
  const host = normalizeHost(trimChars(raw, ".-", true));
  const labels = host.split(".");
  const tld = labels[labels.length - 1];
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return "";
  return TLD.test(tld) && !FILE_EXTENSIONS.has(tld) ? host : "";
}

/** Index of the first whitespace at or after `from`, or text.length. */
function nextSpace(text: string, from: number): number {
  const space = /\s/g;
  space.lastIndex = from;
  return space.exec(text)?.index ?? text.length;
}

/**
 * Hosts named in the text: URL hosts, email domains and bare domains. Lowercased, without "www." or a
 * trailing dot, deduped in first-seen order.
 */
export function extractDomains(text: string): string[] {
  const found = new Set<string>();
  const add = (raw: string): boolean => {
    const host = asDomain(raw);
    if (host) found.add(host);
    return host !== "";
  };
  // Label characters, plus the _ % + an email's local part may hold, so "first.last+ap@" is skipped whole.
  const runs = /[\p{sc=Latin}\p{sc=Cyrillic}\p{sc=Greek}\p{N}._%+-]+/gu;
  for (let m = runs.exec(text); m; m = runs.exec(text)) {
    const end = m.index + m[0].length;
    if (text[end] === "@") continue; // an email's local part, or a URL's user info
    if (text.startsWith("://", end)) {
      // Only the host counts, not user info ("amazon.com@"), the port or the path ("/index.html").
      const stop = nextSpace(text, end + 3);
      const authority = text.slice(end + 3, stop).split(/[\/?#]/, 1)[0];
      add(authority.slice(authority.lastIndexOf("@") + 1).split(/[^\p{sc=Latin}\p{sc=Cyrillic}\p{sc=Greek}\p{N}.-]/u, 1)[0]);
      runs.lastIndex = stop;
      continue;
    }
    const emailDomainRun = text[m.index - 1] === "@";
    let isHost = false;
    // "--" reads as a dash ("pay now--paypal.com"), except in punycode's "xn--".
    for (const piece of m[0].split(/[_%+]|\.{2,}|(?<![xX][nN])-{2,}/)) {
      isHost = !emailDomainRun && SENTENCE_BREAK.test(piece) ? false : add(piece);
    }
    // The path after a bare domain ("evil.example/index.html") isn't read for more domains.
    if (isHost && text[end] === "/") runs.lastIndex = nextSpace(text, end);
  }
  return [...found];
}

/** The last two labels, or the last three under a two-level suffix: billing.example.co.uk -> example.co.uk. */
export function registrableDomain(host: string): string {
  const labels = trimChars(host.trim().toLowerCase(), ".").split(".");
  return labels.slice(TWO_LEVEL_SUFFIXES.has(labels.slice(-2).join(".")) ? -3 : -2).join(".");
}

/** Folds lookalike characters, so g00gle, paypa1 and rnicrosoft fold the same as google, paypal and microsoft. */
function skeleton(label: string): string {
  return label
    .replace(/[0134578i]/g, (c) => LOOKALIKE_CHARS[c])
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/-/g, "");
}

/**
 * Edits allowed from a brand: 1 at 6-9 letters, 2 at 10+. Shorter names are one typo from real words
 * (apple, apply), and two edits from a 9-letter name reach unrelated ones (lumenlabs, humanlabs).
 */
function typoLimit(folded: string): number {
  return folded.length >= 10 ? 2 : folded.length >= 6 ? 1 : 0;
}

/** Builds the book's known domains and brands once, then checks hosts against them. */
function lookalikeChecker(vendors: readonly BookVendor[], ownerEmail?: string | null): (host: string) => boolean {
  const ownerDomain = emailDomain(ownerEmail ?? "");
  const vendorDomains = vendors.flatMap((v) => v.domains);
  const onFileDomains = vendors.flatMap((v) => v.emailsOnFile.map(emailDomain));
  const known = [...WELL_KNOWN_DOMAINS, ...vendorDomains, ...onFileDomains, ownerDomain]
    .map(normalizeHost)
    .filter(Boolean);
  // Email-on-file domains are known but aren't brands: Sam's mail.example must not make mall.com a lookalike.
  const brandNames = new Set(BRAND_LABELS);
  for (const domain of [...vendorDomains, ownerDomain]) {
    const name = registrableDomain(normalizeHost(domain)).split(".")[0];
    if (name.length >= 5) brandNames.add(name);
  }
  const brands = [...brandNames].map((name) => {
    const folded = skeleton(name);
    return { name, folded, limit: typoLimit(folded) };
  });

  return (host) => {
    const h = normalizeHost(host);
    if (!h || known.some((domain) => isSameOrSubdomain(h, domain))) return false;
    const labels = h.split(".");
    // An IDN homograph travels as punycode (xn--pple-43d.com) or as the raw letters (аpple.com, Cyrillic а).
    if (labels.some((label) => label.startsWith("xn--") || /[^\x00-\x7f]/.test(label))) return true;
    const folded = skeleton(registrableDomain(h).split(".")[0]);
    const tokens = new Set(h.split(/[._0-9-]+/));
    const foldedTokens = new Set(h.split(/[._-]+/).map(skeleton));
    return brands.some((b) => {
      // Homoglyphs or another TLD (g00gle.com, pixelandpine.co), then typos (goggle.com, docusing.com).
      if (folded === b.folded) return true;
      const near = b.limit > 0 && Math.abs(folded.length - b.folded.length) <= b.limit; // distance >= length gap
      if (near && osaDistance(folded, b.folded) <= b.limit) return true;
      // The brand inside a longer host, as typed or folded: aws-billing.com, amazon.com.billing-update.net,
      // amaz0n-billing.com, secure-paypa1.com.
      if (tokens.has(b.name) || foldedTokens.has(b.folded)) return true;
      // As a prefix or suffix only from 6 letters, so pineapple.com isn't an apple lookalike. Folded, so
      // a brand split by hyphens counts too: northwind-cloud-billing.example.
      if (b.name.length < 6) return false;
      return labels.some((label) => {
        const f = skeleton(label);
        return label.startsWith(b.name) || label.endsWith(b.name) || f.startsWith(b.folded) || f.endsWith(b.folded);
      });
    });
  };
}

/**
 * True when host imitates a brand, a vendor or the owner without being a known domain or one of its
 * subdomains. Known: WELL_KNOWN_DOMAINS, vendor domains, email-on-file domains and the owner's email domain.
 */
export function isLookalikeDomain(host: string, vendors: readonly BookVendor[], ownerEmail?: string | null): boolean {
  return lookalikeChecker(vendors, ownerEmail)(host);
}

/** Lookalike domains in a case: the sender's email domain, then the domains in the text, deduped in that order. */
export function findLookalikeDomains(args: {
  fromAddress: string;
  rawContent: string;
  vendors: readonly BookVendor[];
  ownerEmail?: string | null;
}): string[] {
  const isLookalike = lookalikeChecker(args.vendors, args.ownerEmail);
  // emailDomain is "" for a phone or agent sender, and "" is never a lookalike.
  const candidates = new Set([normalizeHost(emailDomain(args.fromAddress)), ...extractDomains(args.rawContent)]);
  return [...candidates].filter(isLookalike);
}
