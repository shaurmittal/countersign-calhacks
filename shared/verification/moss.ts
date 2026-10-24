// Moss vendor search: what goes into the index and how its hits feed matchVendor (owner: P3). Spec §3.2, §6.2.
// Pure. The "use node" actions in convex/agents/moss.ts talk to Moss. Only vendor names and aliases are
// indexed: the Moss SDK sends document text to its cloud, and nothing else is needed to match a name.
import type { BookVendor, SearchHit } from "./types";

/** Each deployment gets its own index, so teammates' dev deployments on one Moss project don't collide. */
export const VENDOR_INDEX_PREFIX = "countersign-vendors";

/**
 * Moss's similarity floor for a hit to lift a vendor match. Measured on the seed book with moss-minilm
 * (2026-10-24): impostors reach 0.87 ("Sam's Club" -> Sam Ortiz) and even 1.00 ("Northern Cloud" ->
 * Northwind Cloud), so only near-certain hits count. The team accepted that near-names such as
 * "Northern Cloud" match, in exchange for abbreviations such as "NW Cloud" (0.97).
 */
export const MOSS_MIN_SCORE = 0.95;

/** Budget for one search inside the Node action, and the cap the agents wait for it (cold starts). */
export const MOSS_SEARCH_BUDGET_MS = 3_000;
export const MOSS_CALLER_TIMEOUT_MS = 5_000;

export type MossDoc = { id: string; text: string; metadata: Record<string, string> };

/** `prefix` plus the deployment's name: ("countersign-vendors", "https://happy-otter-123.convex.cloud") -> "countersign-vendors-happy-otter-123". */
export function deploymentIndexName(prefix: string, deploymentUrl: string | undefined): string {
  let host = "";
  try {
    host = new URL(deploymentUrl ?? "").hostname;
  } catch {
    // No deployment URL (tests): the bare prefix.
  }
  const slug = (host.split(".")[0] ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `${prefix}-${slug}` : prefix;
}

export function vendorIndexName(deploymentUrl: string | undefined): string {
  return deploymentIndexName(VENDOR_INDEX_PREFIX, deploymentUrl);
}

/** One document per name and alias, so a short alias isn't averaged with the others. Ids are "<vendorId>#<n>". */
export function vendorSearchDocs(vendors: readonly BookVendor[]): MossDoc[] {
  return vendors.flatMap((v) =>
    [v.name, ...v.aliases]
      .map((text, n) => ({ id: `${v.id}#${n}`, text: text.trim(), metadata: { vendorId: v.id, kind: n === 0 ? "name" : "alias" } }))
      .filter((doc) => doc.text !== ""),
  );
}

/** The vendor a document belongs to, or null for an id vendorSearchDocs didn't write. */
export function vendorIdFromDocId(docId: string): string | null {
  const cut = docId.lastIndexOf("#");
  return cut > 0 && /^\d+$/.test(docId.slice(cut + 1)) ? docId.slice(0, cut) : null;
}

/** Moss results as searchHits: each vendor's best score, clamped to 0..1, dropped below minScore. */
export function toSearchHits(docs: readonly { id: string; score: number }[], minScore = MOSS_MIN_SCORE): SearchHit[] {
  const best = new Map<string, number>();
  for (const doc of docs) {
    const vendorId = vendorIdFromDocId(doc.id);
    if (vendorId === null || !Number.isFinite(doc.score)) continue;
    const score = Math.min(1, Math.max(0, doc.score));
    if (score >= minScore) best.set(vendorId, Math.max(best.get(vendorId) ?? 0, score));
  }
  return [...best].map(([vendorId, score]) => ({ vendorId, score })).sort((a, b) => b.score - a.score);
}

/** The promise's value, or `fallback` once `ms` pass or if it rejects. Moss is an extra, never a blocker. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise.catch(() => fallback), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
