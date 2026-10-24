// Hash chain for the audit log: hash = sha256(prevHash + canonical(event)).
// Pure, so it is unit-tested here and used by convex/audit.ts. canonical() sorts object keys,
// so the hash doesn't depend on the key order a database returns.

export const GENESIS = "0".repeat(64);

export type ChainEvent = { seq: number; caseId?: string | null; actor: string; action: string; payload: unknown; at: number };
export type ChainedEvent = ChainEvent & { prevHash: string; hash: string };

export async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** JSON with sorted keys and undefined object fields dropped (as JSON.stringify and Convex both do). */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : stableStringify(v))).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function canonical(e: ChainEvent): string {
  return stableStringify([e.seq, e.caseId ?? null, e.actor, e.action, e.payload ?? null, e.at]);
}

export async function hashEvent(prevHash: string, e: ChainEvent): Promise<string> {
  return sha256Hex(prevHash + canonical(e));
}

/** Recomputes the chain in seq order. Returns the first broken seq, or null if intact. */
export async function verifyEvents(events: ChainedEvent[]): Promise<{ ok: boolean; brokenAtSeq: number | null }> {
  let prevHash = GENESIS;
  for (const e of events) {
    if (e.prevHash !== prevHash || e.hash !== (await hashEvent(prevHash, e))) return { ok: false, brokenAtSeq: e.seq };
    prevHash = e.hash;
  }
  return { ok: true, brokenAtSeq: null };
}
