"use node";
// Moss vendor search (owner: P3). Spec §3.2, §6.2.
// @moss-js/moss ships native binaries, so it runs only in this Node file (convex.json lists it under
// node.externalPackages). Best-effort by design: when Moss isn't set up, is slow or fails, a search
// returns no hits and the in-memory matcher in shared/verification decides alone.
// Credentials: MOSS_PROJECT_ID and MOSS_API_KEY (the Moss project key), as Convex env vars.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { MossClient } from "@moss-js/moss";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  MOSS_MIN_SCORE,
  MOSS_SEARCH_BUDGET_MS,
  toSearchHits,
  vendorIndexName,
  vendorSearchDocs,
  withTimeout,
} from "../../shared/verification/moss";
import type { SearchHit, VerificationBook } from "../../shared/verification/types";

// Only /tmp is writable here. The client keeps its device id and index cache under CACHE_PATH.
const CACHE_PATH = "/tmp/moss";

type Credentials = { projectId: string; projectKey: string };

function credentials(): Credentials | null {
  const projectId = process.env.MOSS_PROJECT_ID;
  const projectKey = process.env.MOSS_API_KEY;
  return projectId && projectKey ? { projectId, projectKey } : null;
}

function describeError(err: unknown): string {
  const field = (name: string) =>
    typeof err === "object" && err !== null && name in err ? String((err as Record<string, unknown>)[name]) : "";
  const code = field("code");
  const detail = field("detail");
  const message = err instanceof Error ? err.message : String(err);
  return `${code ? `${code}: ` : ""}${message}${detail ? ` (${detail})` : ""}`.slice(0, 500);
}

// ---- Query worker ----
// The native core caches its embedding model under $HOME, which is read-only here, and Convex's process.env
// changes never reach native code ("Read-only file system", reported as MODEL_UNAVAILABLE). So queries run in
// a child Node process started with a real environment that points the caches at /tmp. It loads each index
// once (auto-refreshed, so a re-seed reaches it) and is reused while this process stays warm.
const WORKER_SOURCE = `
const { MossClient } = await import(process.env.MOSS_SDK_URL);
const client = new MossClient(process.env.MOSS_PROJECT_ID, process.env.MOSS_PROJECT_KEY, { cachePath: process.env.MOSS_CACHE });
const loaded = new Map();
function load(index) {
  let ready = loaded.get(index);
  if (!ready) {
    ready = client.loadIndex(index, { cachePath: process.env.MOSS_CACHE, autoRefresh: true, pollingIntervalInSeconds: 60 });
    ready.catch(() => loaded.delete(index));
    loaded.set(index, ready);
  }
  return ready;
}
const why = (e) => [e && e.code, e && e.message ? e.message : String(e), e && e.detail].filter(Boolean).join(": ");
process.on("message", async (m) => {
  try {
    if (m.type === "unload") {
      loaded.delete(m.index);
      await client.unloadIndex(m.index).catch(() => {});
      process.send({ id: m.id, ok: true, docs: [] });
      return;
    }
    await load(m.index);
    const r = await client.query(m.index, m.query, { topK: m.topK });
    process.send({ id: m.id, ok: true, docs: r.docs.map((d) => ({ id: d.id, score: d.score })) });
  } catch (e) {
    process.send({ id: m.id, ok: false, error: why(e) });
  }
});
process.on("disconnect", () => process.exit(0));
`;

type QueryDoc = { id: string; score: number };
type WorkerReply = { id: number; ok: boolean; docs?: QueryDoc[]; error?: string };
type Worker = {
  child: ChildProcess;
  projectId: string;
  pending: Map<number, { resolve: (docs: QueryDoc[]) => void; reject: (err: Error) => void }>;
  nextId: number;
  stderr: string;
};

let worker: Worker | null = null;

function startWorker(creds: Credentials): Worker {
  const home = `${CACHE_PATH}/home`;
  fs.mkdirSync(home, { recursive: true });
  const sdkUrl = pathToFileURL(createRequire(import.meta.url).resolve("@moss-js/moss")).href;
  // Deliberately minimal: nothing else from this process reaches the worker.
  const env = {
    NODE_ENV: process.env.NODE_ENV ?? "production",
    PATH: process.env.PATH ?? "",
    HOME: home,
    XDG_CACHE_HOME: `${home}/.cache`,
    MOSS_MODEL_CACHE_DIR: `${CACHE_PATH}/model-cache`,
    MOSS_SESSION_CACHE_PATH: `${CACHE_PATH}/sessions`,
    MOSS_CACHE: CACHE_PATH,
    MOSS_SDK_URL: sdkUrl,
    MOSS_PROJECT_ID: creds.projectId,
    MOSS_PROJECT_KEY: creds.projectKey,
  };
  const child: ChildProcess = spawn(process.execPath, ["--input-type=module", "-e", WORKER_SOURCE], {
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    env,
  });
  const w: Worker = { child, projectId: creds.projectId, pending: new Map(), nextId: 1, stderr: "" };
  const fail = (err: Error) => {
    if (worker === w) worker = null;
    for (const p of w.pending.values()) p.reject(err);
    w.pending.clear();
  };
  child.on("message", (raw) => {
    const reply = raw as WorkerReply;
    const p = w.pending.get(reply.id);
    if (!p) return;
    w.pending.delete(reply.id);
    if (w.pending.size === 0) child.channel?.unref();
    if (reply.ok) p.resolve(reply.docs ?? []);
    else p.reject(new Error(reply.error ?? "Moss worker error"));
  });
  // onnxruntime prints CPU-detection warnings here; keep the tail for crash reports.
  child.stderr?.on("data", (chunk: Buffer) => {
    w.stderr = (w.stderr + chunk.toString()).slice(-600);
  });
  child.on("error", (err) => fail(err));
  child.on("exit", (code) => fail(new Error(`Moss worker exited (${code}): ${w.stderr.trim().slice(-300)}`)));
  // The worker must never keep this action open: it only holds the event loop while a request waits.
  child.unref();
  child.channel?.unref();
  (child.stderr as unknown as { unref?: () => void } | null)?.unref?.();
  return w;
}

function ask(creds: Credentials, message: { type: "query" | "unload"; index: string; query?: string; topK?: number }) {
  if (!worker || worker.projectId !== creds.projectId) {
    worker?.child.kill();
    worker = startWorker(creds);
  }
  const w = worker;
  const id = w.nextId++;
  return new Promise<QueryDoc[]>((resolve, reject) => {
    w.pending.set(id, { resolve, reject });
    w.child.channel?.ref();
    try {
      w.child.send({ id, ...message });
    } catch (err) {
      w.pending.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/** Rebuilds this deployment's Moss index from the vendor book. The seed schedules it; safe to re-run. */
export const syncVendorIndex = internalAction({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; index: string; docCount: number; reason?: string }> => {
    const index = vendorIndexName(process.env.CONVEX_CLOUD_URL);
    const creds = credentials();
    if (!creds) return { ok: false, index, docCount: 0, reason: "MOSS_PROJECT_ID or MOSS_API_KEY is not set" };
    const book: VerificationBook = await ctx.runQuery(internal.agents.vendorVerifier.loadVerificationBook, {});
    const docs = vendorSearchDocs(book.vendors);
    // Index management happens in the cloud, so it needs no local model and runs in this process.
    const client = new MossClient(creds.projectId, creds.projectKey, { cachePath: CACHE_PATH });
    try {
      // Vendor ids change on every seed, so the index is rebuilt rather than patched.
      if ((await client.listIndexes()).some((i) => i.name === index)) await client.deleteIndex(index);
      if (docs.length > 0) await client.createIndex(index, docs);
    } finally {
      await client.close();
    }
    if (worker) await withTimeout(ask(creds, { type: "unload", index }), 5_000, []);
    return { ok: true, index, docCount: docs.length };
  },
});

/**
 * Vendors whose name or alias is close to `query`. [] when Moss isn't set up, fails, or runs past its
 * budget. `minScore` and `budgetMs` are for tuning and warm-up; the agents use the defaults.
 */
export const searchVendors = internalAction({
  args: { query: v.string(), minScore: v.optional(v.number()), budgetMs: v.optional(v.number()) },
  handler: async (_ctx, { query, minScore, budgetMs }): Promise<SearchHit[]> => {
    const creds = credentials();
    if (!creds || query.trim() === "") return [];
    const index = vendorIndexName(process.env.CONVEX_CLOUD_URL);
    const hits = ask(creds, { type: "query", index, query, topK: 10 })
      .then((docs) => toSearchHits(docs, minScore ?? MOSS_MIN_SCORE))
      .catch((err: unknown): SearchHit[] => {
        console.warn(`[moss] search failed: ${describeError(err)}`);
        return [];
      });
    return withTimeout(hits, budgetMs ?? MOSS_SEARCH_BUDGET_MS, []);
  },
});
