// Email authentication (owner: P2). Pure: headers in, a verdict out. Rule R17 and the Vendor Verifier read it.
// "From:" is free text that anyone can type, so an email only counts as coming from an address on file when
// the receiving server says the domain really sent it: DMARC pass, or DKIM/SPF passing for the From domain.
//
// Only the TOPMOST Authentication-Results, Received-SPF and X-Spam-Tests headers are read. Those are added by
// the server that received the mail for us (Postmark). Anything further down travelled with the message and
// a sender can write whatever they like there, including a fake "dmarc=pass".
import { registrableDomain } from "../verification/lookalike";
import { emailDomain } from "../verification/text";
import type { AuthResult, EmailAuth } from "../types";

export type { AuthResult, EmailAuth };

export type Header = { Name: string; Value: string };

/** The first (topmost) header with this name, or null. */
export function topHeader(headers: readonly Header[], name: string): string | null {
  const lower = name.toLowerCase();
  return headers.find((h) => h.Name.toLowerCase() === lower)?.Value ?? null;
}

const RESULTS = new Set(["pass", "fail", "softfail", "none", "neutral", "temperror", "permerror", "policy", "hardfail"]);

function normalizeResult(r: string | undefined): AuthResult {
  const v = (r ?? "").toLowerCase();
  if (v === "pass") return "pass";
  if (v === "fail" || v === "hardfail") return "fail";
  if (v === "softfail") return "softfail";
  if (v === "none" || v === "neutral") return "none";
  return "unknown";
}

/** Same organization: equal registrable domains (mail.pixelandpine.com aligns with pixelandpine.com). */
export function aligned(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return registrableDomain(a.toLowerCase()) === registrableDomain(b.toLowerCase());
}

type MethodResult = { result: AuthResult; domain: string | null };

/**
 * RFC 8601 Authentication-Results: "mx.example; dkim=pass header.d=gmail.com; spf=pass smtp.mailfrom=x@gmail.com;
 * dmarc=pass header.from=gmail.com". Several dkim= entries are common (one per signature); any aligned pass wins.
 */
export function parseAuthenticationResults(value: string): { spf: MethodResult[]; dkim: MethodResult[]; dmarc: MethodResult[] } {
  const out = { spf: [] as MethodResult[], dkim: [] as MethodResult[], dmarc: [] as MethodResult[] };
  // Comments in parentheses can hold anything, including "dkim=pass"; drop them first.
  const clean = value.replace(/\([^()]*\)/g, " ");
  for (const part of clean.split(";").slice(1)) {
    const m = part.trim().match(/^(spf|dkim|dmarc)\s*=\s*([a-z]+)/i);
    if (!m || !RESULTS.has(m[2].toLowerCase())) continue;
    const method = m[1].toLowerCase() as "spf" | "dkim" | "dmarc";
    const prop = (key: string) => part.match(new RegExp(`${key}\\s*=\\s*([^\\s;]+)`, "i"))?.[1] ?? null;
    let domain: string | null = null;
    if (method === "dkim") domain = prop("header\\.d") ?? domainOf(prop("header\\.i"));
    else if (method === "spf") domain = domainOf(prop("smtp\\.mailfrom")) ?? prop("smtp\\.helo");
    else domain = prop("header\\.from");
    out[method].push({ result: normalizeResult(m[2]), domain: domain?.replace(/^@/, "").toLowerCase() ?? null });
  }
  return out;
}

function domainOf(value: string | null): string | null {
  if (!value) return null;
  const at = value.lastIndexOf("@");
  return at >= 0 ? value.slice(at + 1) : value;
}

/** "Pass (sender SPF authorized) identity=mailfrom; envelope-from=x@gmail.com; ..." */
export function parseReceivedSpf(value: string): MethodResult {
  const result = normalizeResult(value.trim().split(/\s+/)[0]);
  const from = value.match(/envelope-from=["<]?([^\s;">]+)/i)?.[1] ?? null;
  return { result, domain: domainOf(from)?.toLowerCase() ?? null };
}

/** SpamAssassin's summary ("DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU,SPF_PASS"). DKIM_VALID_AU means valid AND aligned with From. */
export function parseSpamTests(value: string): { spf: AuthResult; dkimAligned: AuthResult; dmarc: AuthResult } {
  const tests = new Set(value.split(/[\s,]+/).map((t) => t.toUpperCase()));
  const spf: AuthResult = tests.has("SPF_PASS")
    ? "pass"
    : tests.has("SPF_FAIL")
      ? "fail"
      : tests.has("SPF_SOFTFAIL")
        ? "softfail"
        : tests.has("SPF_NONE")
          ? "none"
          : "unknown";
  const dkimAligned: AuthResult = tests.has("DKIM_VALID_AU")
    ? "pass"
    : tests.has("DKIM_INVALID") || (tests.has("DKIM_SIGNED") && !tests.has("DKIM_VALID"))
      ? "fail"
      : tests.has("DKIM_SIGNED")
        ? "none" // valid, but signed by someone other than the From domain
        : "unknown";
  const dmarc: AuthResult = tests.has("DMARC_PASS")
    ? "pass"
    : tests.has("DMARC_REJECT") || tests.has("DMARC_QUAR") || tests.has("DMARC_FAIL")
      ? "fail"
      : tests.has("DMARC_NONE") || tests.has("DMARC_MISSING")
        ? "none"
        : "unknown";
  return { spf, dkimAligned, dmarc };
}

const ADDRESS_OR_DOMAIN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\b(?:[a-z0-9-]+\.)+[a-z]{2,24}\b/gi;

/** An address or domain written in the display name that belongs to someone other than the From domain. */
export function displayNameClaim(displayName: string | null | undefined, fromDomain: string): string | null {
  if (!displayName) return null;
  for (const [match] of displayName.matchAll(ADDRESS_OR_DOMAIN)) {
    const domain = (match.includes("@") ? match.slice(match.lastIndexOf("@") + 1) : match).toLowerCase();
    if (!aligned(domain, fromDomain)) return match.toLowerCase();
  }
  return null;
}

/** Everything R17 needs from one inbound email. */
export function assessEmailAuth(args: {
  headers: readonly Header[];
  from: string;
  fromName?: string | null;
  replyTo?: string | null;
}): EmailAuth {
  const fromDomain = emailDomain(args.from);
  let spf: AuthResult = "unknown";
  let dkim: AuthResult = "unknown";
  let dmarc: AuthResult = "unknown";
  let spfAligned = false;
  let dkimAligned = false;

  const ar = topHeader(args.headers, "Authentication-Results");
  if (ar) {
    const parsed = parseAuthenticationResults(ar);
    const pick = (list: MethodResult[]) => {
      const alignedPass = list.find((r) => r.result === "pass" && aligned(r.domain, fromDomain));
      if (alignedPass) return { result: "pass" as AuthResult, aligned: true };
      const fail = list.find((r) => r.result === "fail");
      if (fail) return { result: "fail" as AuthResult, aligned: false };
      // A pass for some other domain (a mailing service's own signature) proves nothing about From.
      const first = list[0]?.result ?? ("unknown" as AuthResult);
      return { result: first === "pass" ? ("none" as AuthResult) : first, aligned: false };
    };
    const s = pick(parsed.spf);
    const d = pick(parsed.dkim);
    spf = s.result;
    spfAligned = s.aligned;
    dkim = d.result;
    dkimAligned = d.aligned;
    const dm = parsed.dmarc[0];
    if (dm && (dm.domain == null || aligned(dm.domain, fromDomain))) dmarc = dm.result;
  }

  if (spf === "unknown") {
    const rs = topHeader(args.headers, "Received-SPF");
    if (rs) {
      const parsed = parseReceivedSpf(rs);
      spf = parsed.result;
      spfAligned = parsed.result === "pass" && aligned(parsed.domain, fromDomain);
    }
  }

  const st = topHeader(args.headers, "X-Spam-Tests");
  if (st) {
    const parsed = parseSpamTests(st);
    if (spf === "unknown") spf = parsed.spf;
    if (dkim === "unknown" && parsed.dkimAligned !== "unknown") {
      dkim = parsed.dkimAligned === "none" ? "none" : parsed.dkimAligned;
      dkimAligned = parsed.dkimAligned === "pass";
    }
    if (dmarc === "unknown") dmarc = parsed.dmarc;
  }

  let verdict: EmailAuth["verdict"] = "unknown";
  if (!fromDomain) verdict = "fail";
  else if (dmarc === "pass" || dkimAligned || spfAligned) verdict = "pass";
  else if (dmarc === "fail" || spf === "fail" || dkim === "fail") verdict = "fail";

  const replyDomain = args.replyTo ? emailDomain(args.replyTo) : "";
  return {
    spf,
    dkim,
    dmarc,
    verdict,
    replyToDomain: replyDomain && !aligned(replyDomain, fromDomain) ? replyDomain : null,
    displayNameClaims: fromDomain ? displayNameClaim(args.fromName, fromDomain) : null,
  };
}

/** "SPF ✓ DKIM ✓ DMARC ✓" for lanes and badges. */
export function authBadge(a: EmailAuth): string {
  const mark = (r: AuthResult) => (r === "pass" ? "✓" : r === "fail" || r === "softfail" ? "✕" : "–");
  return `SPF ${mark(a.spf)} DKIM ${mark(a.dkim)} DMARC ${mark(a.dmarc)}`;
}

