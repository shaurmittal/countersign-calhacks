// Text helpers shared by the P3 verification modules (owner: P3). Pure: no I/O, no clock.

/**
 * Optimal string alignment distance: Levenshtein plus swapping two adjacent characters
 * ("pixle" -> "pixel" is 1). Unlike full Damerau, a swapped pair can't be edited again.
 */
export function osaDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) d.push([i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2][j - 2] + 1);
      d[i][j] = best;
    }
  }
  return d[a.length][b.length];
}

/** 1 - distance / longer length, in 0..1. Empty input scores 0 so blanks never match. */
export function similarity(a: string, b: string): number {
  const longer = Math.max(a.length, b.length);
  if (a.length === 0 || b.length === 0) return 0;
  return 1 - osaDistance(a, b) / longer;
}

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** Only digits and phone punctuation, with at least 10 digits. Agent addresses and emails are not phones. */
export function isPhoneLike(address: string): boolean {
  return /^[+\d\s().-]+$/.test(address.trim()) && digitsOnly(address).length >= 10;
}

/** Digits only, and a 10-digit US number gets its leading 1. "" when the input isn't a phone number. */
export function normalizePhone(address: string): string {
  if (!isPhoneLike(address)) return "";
  const digits = digitsOnly(address);
  return digits.length === 10 ? `1${digits}` : digits;
}

/** Lowercased address, taken from inside <...> when present ("Pixel <billing@x.example>"). "" when it isn't an email. */
export function normalizeEmail(address: string): string {
  const angle = address.match(/<([^<>]+)>/);
  const email = (angle ? angle[1] : address).trim().toLowerCase().replace(/^mailto:/, "");
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : "";
}

/** Domain of an email address, lowercased, or "" when the input isn't an email. */
export function emailDomain(address: string): string {
  const email = normalizeEmail(address);
  return email ? email.slice(email.lastIndexOf("@") + 1).replace(/\.+$/, "") : "";
}

/** host is domain itself or one of its subdomains. A registered domain can't be extended by anyone else. */
export function isSameOrSubdomain(host: string, domain: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.+$/, "");
  const d = domain.trim().toLowerCase().replace(/\.+$/, "");
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}
