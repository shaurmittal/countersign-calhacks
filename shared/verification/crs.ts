// CRS sandbox: AtData Fraud Finder on a sender's email (owner: P3). Spec §6.2, §8.
// Pure apart from the fetch the caller passes in. runVendorVerifier (convex/agents/vendorVerifier.ts)
// screens senders the vendor book doesn't know.
// The team's CRS account has no business verification (Business InstantID answers 401 CRS111) and no
// OFAC product, so KYB is dropped and ofacHit stays false: OFAC never runs. AtData's email risk fits
// invoice fraud instead: a scam email comes from an address or domain nobody has seen before.
// The owner's and the vendors' addresses on file aren't screened. The book already vouches for them, and
// the seed's reserved *.example domains score 100 at AtData whoever sends from them.
import type { VendorFindings } from "../types";
import { normalizeEmail } from "./text";
import type { VerificationBook } from "./types";
import { checkSender } from "./vendorMatch";

export const CRS_SANDBOX_API = "https://api-sandbox.stitchcredit.com/api";
export const FRAUD_FINDER_PATH = "/fraud-finder/fraud-finder";
export const FRAUD_FINDER = "atdata_fraud_finder";

/** AtData's risk.score runs 0..100, higher is riskier. AtData suggests a cut-off around 70-80; the low end is safer. */
export const FRAUD_RISK_THRESHOLD = 70;

/** The whole check inside the Vendor Verifier: a login (about 0.5 s in the sandbox) and one call (about 0.3 s). */
export const CRS_BUDGET_MS = 4_000;
export const CRS_REQUEST_TIMEOUT_MS = 3_000;

/** A sandbox token lasts 60 minutes. */
export const TOKEN_REUSE_MS = 45 * 60_000;

/** Repeated failed logins lock the CRS account (CRS113, then CRS114), so a rejected login waits 10 minutes. */
export const LOGIN_PAUSE_AFTER_REJECT_MS = 10 * 60_000;
export const LOGIN_PAUSE_AFTER_ERROR_MS = 30_000;

export type CrsConfig = { api: string; username: string; password: string };
export type CrsResult = VendorFindings["crs"];

/** What the War Room may show. No address: public queries return vendorFindings as they are. */
export type FraudFinderSummary = {
  score: number;
  domainRiskScore: number | null;
  emailStatus: string | null;
  roleAccount: boolean | null;
  emailFirstSeen: string | null;
  domainFirstSeen: string | null;
};

/** The CRS API root (".../api") on the sandbox host, or null for any other host: Countersign uses only the sandbox. */
export function crsApiBase(baseUrl: string | undefined): string | null {
  let url: URL;
  try {
    url = new URL(baseUrl?.trim() || CRS_SANDBOX_API);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== new URL(CRS_SANDBOX_API).hostname) return null;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path.endsWith("/api") ? path : `${path}/api`}`;
}

/** CRS settings from the deployment's env vars, or null when CRS isn't set up there (then nothing is screened). */
export function crsConfig(env: Record<string, string | undefined>): CrsConfig | null {
  const username = env.CRS_USERNAME?.trim();
  const password = env.CRS_PASSWORD;
  const api = crsApiBase(env.CRS_BASE_URL);
  return username && password && api ? { api, username, password } : null;
}

/** The sender's email when CRS should screen it, or null: not an email, the owner, or on a vendor's file. */
export function emailToScreen(fromAddress: string, book: Pick<VerificationBook, "vendors" | "owner">): string | null {
  const email = normalizeEmail(fromAddress);
  if (email === "") return null;
  const sender = checkSender(fromAddress, null, book);
  return sender.isOwner || sender.onAnyVendorFile ? null : email;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function finite(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function shortText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value.slice(0, 40) : null;
}

/** The fields Countersign uses from a Fraud Finder response, or null without a numeric risk.score. */
export function parseFraudFinder(body: unknown): FraudFinderSummary | null {
  const risk = record(record(body)?.risk);
  const score = finite(risk?.score);
  if (score === null) return null;
  const validation = record(record(body)?.email_validation);
  return {
    score: Math.min(100, Math.max(0, score)),
    domainRiskScore: finite(record(risk?.domain)?.domain_risk_score),
    emailStatus: shortText(validation?.status),
    roleAccount: typeof validation?.role_account === "boolean" ? validation.role_account : null,
    emailFirstSeen: shortText(record(record(body)?.eam)?.date_first_seen),
    domainFirstSeen: shortText(record(record(body)?.dam)?.date_first_seen),
  };
}

/**
 * What a Fraud Finder result means for decide(). A high score means CRS can't vouch for the sender, so
 * businessVerified is false and R14 escalates. A low score proves nothing about a business, so
 * businessVerified stays unset rather than claiming a pass.
 */
export function crsFromFraudFinder(summary: FraudFinderSummary): CrsResult {
  const raw = { product: FRAUD_FINDER, threshold: FRAUD_RISK_THRESHOLD, ...summary };
  return summary.score >= FRAUD_RISK_THRESHOLD ? { status: "ok", businessVerified: false, raw } : { status: "ok", raw };
}

/** Any failure. decide() escalates on "unavailable" (R14). The reason is a status or a CRS code, never a secret. */
export function crsUnavailable(reason: string): CrsResult {
  return { status: "unavailable", raw: { product: FRAUD_FINDER, reason } };
}

/** The part of fetch the client uses, so tests can pass a fake. */
export type CrsFetch = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ status: number; text(): Promise<string> }>;

type Reply = { status: number; body: unknown } | { failed: "timeout" | "network error" };

const ok = (status: number) => status >= 200 && status < 300;

/** " CRS111" from a CRS error body such as {"codes":["CRS111"],"messages":["Access Denied"]}, or "". */
function crsCode(body: unknown): string {
  const codes = record(body)?.codes;
  return Array.isArray(codes) && typeof codes[0] === "string" ? ` ${codes[0].slice(0, 12)}` : "";
}

/**
 * A CRS client that logs in once, reuses the token and, after a failed login, pauses instead of
 * retrying. screenEmail never throws and never reports "ok" for a check that didn't complete.
 */
export function createCrsClient(config: CrsConfig, fetchFn: CrsFetch, now: () => number = Date.now) {
  let token: { value: string; reuseUntil: number } | null = null;
  let loginPausedUntil = 0;

  async function post(path: string, body: unknown, bearer?: string): Promise<Reply> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CRS_REQUEST_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
      if (bearer) headers.Authorization = `Bearer ${bearer}`;
      const res = await fetchFn(`${config.api}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Not JSON; the caller treats it as unreadable.
      }
      return { status: res.status, body: parsed };
    } catch {
      return { failed: controller.signal.aborted ? "timeout" : "network error" };
    } finally {
      clearTimeout(timer);
    }
  }

  async function bearer(): Promise<string | { reason: string }> {
    if (token && now() < token.reuseUntil) return token.value;
    if (now() < loginPausedUntil) return { reason: "login paused after a failure" };
    const reply = await post("/users/login", { username: config.username, password: config.password });
    const value = "status" in reply && ok(reply.status) ? record(reply.body)?.token : undefined;
    if (typeof value === "string" && value !== "") {
      token = { value, reuseUntil: now() + TOKEN_REUSE_MS };
      return value;
    }
    const rejected = "status" in reply && reply.status >= 400 && reply.status < 500;
    loginPausedUntil = now() + (rejected ? LOGIN_PAUSE_AFTER_REJECT_MS : LOGIN_PAUSE_AFTER_ERROR_MS);
    return { reason: "status" in reply ? `login HTTP ${reply.status}${crsCode(reply.body)}` : `login ${reply.failed}` };
  }

  /** AtData's risk for one email address, as decide() reads it. */
  async function screenEmail(email: string): Promise<CrsResult> {
    const auth = await bearer();
    if (typeof auth !== "string") return crsUnavailable(auth.reason);
    const reply = await post(FRAUD_FINDER_PATH, { email }, auth);
    if (!("status" in reply)) return crsUnavailable(reply.failed);
    // The token expired early or the product was switched off: log in afresh next time.
    if (reply.status === 401) token = null;
    if (!ok(reply.status)) return crsUnavailable(`HTTP ${reply.status}${crsCode(reply.body)}`);
    const summary = parseFraudFinder(reply.body);
    return summary ? crsFromFraudFinder(summary) : crsUnavailable("unreadable response");
  }

  return { screenEmail };
}

export type CrsClient = ReturnType<typeof createCrsClient>;
