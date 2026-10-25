// Countersigned release payloads (owner: P1). Pure: Web Crypto only, so it runs in Convex's default
// runtime, in edge-runtime tests and in the browser (/bank's "different key" attempt).
//
// The Policy Engine's PAY becomes a signed instruction: the Payer signs exactly one transfer (who, how
// much, which invoice, which case) with COUNTERSIGN_SIGNING_KEY, and Lumen Bank only moves money for a
// payload that verifies against LUMEN_BANK_VERIFY_KEY. Signing is over canonical JSON (sorted keys).
import { stableStringify } from "../audit";

export const PAYLOAD_VERSION = 1;
/** A countersignature is good for two minutes: long enough for the Payer, too short to stockpile. */
export const RELEASE_TTL_MS = 120_000;

export type ReleasePayload = {
  v: 1;
  caseId: string;
  paymentId: string;
  vendorId: string;
  routing: string;
  last4: string;
  amountCents: number;
  invoiceNumber: string;
  decision: "PAY";
  firedRules: string[];
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

const KEYS: (keyof ReleasePayload)[] = [
  "v", "caseId", "paymentId", "vendorId", "routing", "last4", "amountCents", "invoiceNumber",
  "decision", "firedRules", "issuedAt", "expiresAt", "nonce",
];

const ALGO = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN_ALGO = { name: "ECDSA", hash: "SHA-256" } as const;

/** The exact bytes that are signed and verified. */
export function canonicalPayload(payload: unknown): string {
  return stableStringify(payload);
}

/**
 * Shape check for a payload that arrived from outside. Returns null for anything that isn't exactly a
 * release payload (unknown keys included), so the bank never reasons about half-formed instructions.
 * `decision` is checked by the bank as its own step, so any string passes here.
 */
export function parsePayload(x: unknown): (Omit<ReleasePayload, "decision"> & { decision: string }) | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (Object.keys(o).some((k) => !KEYS.includes(k as keyof ReleasePayload))) return null;
  const str = (k: string) => typeof o[k] === "string" && (o[k] as string).length > 0 && (o[k] as string).length < 200;
  const int = (k: string) => typeof o[k] === "number" && Number.isSafeInteger(o[k]);
  if (o.v !== PAYLOAD_VERSION) return null;
  if (!["caseId", "paymentId", "vendorId", "routing", "last4", "invoiceNumber", "decision", "nonce"].every(str)) return null;
  if (!["amountCents", "issuedAt", "expiresAt"].every(int) || (o.amountCents as number) <= 0) return null;
  if (!Array.isArray(o.firedRules) || !o.firedRules.every((r) => typeof r === "string")) return null;
  return o as unknown as Omit<ReleasePayload, "decision"> & { decision: string };
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A new key pair; scripts/countersign-keygen.ts and tests use this. */
export async function generateCountersignKeys(): Promise<{ privateJwk: JsonWebKey; publicJwk: JsonWebKey }> {
  const pair = (await crypto.subtle.generateKey(ALGO, true, ["sign", "verify"])) as CryptoKeyPair;
  return {
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
  };
}

export async function signPayload(payload: unknown, privateJwk: JsonWebKey): Promise<string> {
  const key = await crypto.subtle.importKey("jwk", privateJwk, ALGO, false, ["sign"]);
  const sig = await crypto.subtle.sign(SIGN_ALGO, key, new TextEncoder().encode(canonicalPayload(payload)));
  return bytesToBase64Url(new Uint8Array(sig));
}

/** False for a bad key, a malformed signature or a mismatch. Never throws. */
export async function verifyPayload(payload: unknown, signature: string, publicJwk: JsonWebKey): Promise<boolean> {
  try {
    const sig = base64UrlToBytes(signature);
    if (!sig || sig.length !== 64) return false; // P-256 raw (r || s)
    const key = await crypto.subtle.importKey("jwk", publicJwk, ALGO, false, ["verify"]);
    return await crypto.subtle.verify(SIGN_ALGO, key, sig, new TextEncoder().encode(canonicalPayload(payload)));
  } catch {
    return false;
  }
}

/** Parses a JWK from an env var. Null if missing or not JSON. */
export function jwkFromEnv(value: string | undefined): JsonWebKey | null {
  if (!value?.trim()) return null;
  try {
    const jwk = JSON.parse(value) as JsonWebKey;
    return jwk && typeof jwk === "object" && jwk.kty === "EC" ? jwk : null;
  } catch {
    return null;
  }
}
