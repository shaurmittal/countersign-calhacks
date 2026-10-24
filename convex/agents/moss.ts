"use node";
// Moss vendor search and policy lookup (owner: P3). Spec §3.2, §6.2.
// @moss-js/moss ships native binaries, so it runs only in this Node file (convex.json lists it under
// node.externalPackages). Best-effort by design: when Moss isn't set up, is slow or fails, a search
// returns no hits and the in-memory matcher in shared/verification decides alone.
// One index (MOSS_INDEX) serves every Countersign deployment, because the Moss plan caps a project at
// three indexes: each deployment writes its vendors under its own scope, and every query filters on scope.
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
  MOSS_INDEX,
  MOSS_MIN_SCORE,
  MOSS_SEARCH_BUDGET_MS,
  POLICY_SCOPE,
  deploymentSlug,
  scopeFilter,
  toSearchHits,
  vendorScope,
  vendorSearchDocs,
  withTimeout,
  type MossDoc,
} from "../../shared/verification/moss";
import {
  POLICY_LOOKUP_BUDGET_MS,
  docsFromHits,
  mergeRankings,
  policyAnswer,
  policySearchDocs,
  rankPolicyByKeywords,
  type PolicyAnswer,
  type PolicyDoc,
} from "../../shared/verification/policyLookup";
import type { SearchHit, VerificationBook } from "../../shared/verification/types";

// Only /tmp is writable here. The client keeps its device id and index cache under CACHE_PATH.
const CACHE_PATH = "/tmp/moss";

function slug(): string {
  return deploymentSlug(process.env.CONVEX_CLOUD_URL);
}

/**
 * Moss bills per active device, and every serverless container (and worker) would otherwise mint a new
 * device id under /tmp. One stable id per deployment keeps that to one device.
 */
function deviceId(): string {
  return `countersign-${slug()}`;
}

type Credentials = { projectId: string; projectKey: string };

function credentials(): Credentials | null {
  const projectId = process.env.MOSS_PROJECT_ID;
  const projectKey = process.env.MOSS_API_KEY;
  return projectId && projectKey ? { projectId, projectKey } : null;
}

/** For index management, which happens in the cloud and needs no local model, so it runs in this process. */
function managementClient(creds: Credentials): MossClient {
  return new MossClient(creds.projectId, creds.projectKey, { cachePath: CACHE_PATH, identity: { deviceId: deviceId() } });
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
// a child Node process started with a real environment that points the caches at /tmp. It loads the index
// once (auto-refreshed, so another deployment's sync reaches it) and is reused while this process stays warm.
const WORKER_SOURCE = `
const { MossClient } = await import(process.env.MOSS_SDK_URL);
const client = new MossClient(process.env.MOSS_PROJECT_ID, process.env.MOSS_PROJECT_KEY, {
  cachePath: process.env.MOSS_CACHE,
  identity: { deviceId: process.env.MOSS_DEVICE_ID },
});
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
    const r = await client.query(m.index, m.query, { topK: m.topK, filter: m.filter });
    process.send({ id: m.id, ok: true, docs: r.docs.map((d) => ({ id: d.id, score: d.score })) });
  } catch (e) {
    process.send({ id: m.id, ok: false, error: why(e) });
  }
});
process.on("disconnect", () => process.exit(0));
`;

type QueryDoc = { id: string; score: number };
type WorkerReply = { id: number; ok: boolean; docs?: QueryDoc[]; error?: string };
type WorkerMessage = { type: "query" | "unload"; index: string; query?: string; topK?: number; filter?: unknown };
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
    MOSS_DEVICE_ID: deviceId(),
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

function ask(creds: Credentials, message: WorkerMessage): Promise<QueryDoc[]> {
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

// ---- Index management ----

type SyncResult = { ok: boolean; index: string; scope: string; docCount: number; reason?: string };

const NOT_SET_UP = "MOSS_PROJECT_ID or MOSS_API_KEY is not set";

/**
 * Makes `scope` in the shared index hold exactly `docs`, leaving every other scope alone. The index is
 * updated in place (upsert, then drop this scope's stale documents), never deleted, so a refused write
 * leaves what was there working.
 */
async function syncScope(creds: Credentials, scope: string, docs: MossDoc[]): Promise<SyncResult> {
  const client = managementClient(creds);
  try {
    if (!(await client.listIndexes()).some((i) => i.name === MOSS_INDEX)) {
      if (docs.length > 0) {
        try {
          await client.createIndex(MOSS_INDEX, docs);
        } catch (err) {
          // Another deployment may have created it a moment ago.
          if (!(await client.listIndexes()).some((i) => i.name === MOSS_INDEX)) throw err;
          await client.addDocs(MOSS_INDEX, docs, { upsert: true });
        }
      }
    } else {
      if (docs.length > 0) await client.addDocs(MOSS_INDEX, docs, { upsert: true });
      const keep = new Set(docs.map((d) => d.id));
      const stale = (await client.getDocs(MOSS_INDEX))
        .filter((d) => d.metadata?.scope === scope && !keep.has(d.id))
        .map((d) => d.id);
      if (stale.length > 0) await client.deleteDocs(MOSS_INDEX, stale);
    }
  } finally {
    await client.close();
  }
  // A warm worker still holds the old copy; reloading picks up the new one.
  if (worker) await withTimeout(ask(creds, { type: "unload", index: MOSS_INDEX }), 5_000, []);
  return { ok: true, index: MOSS_INDEX, scope, docCount: docs.length };
}

/** Ops, read-only: every index in the Moss project, since the plan caps how many a project may hold. */
export const listIndexes = internalAction({
  args: {},
  handler: async (): Promise<{ name: string; docCount: number; status: string }[]> => {
    const creds = credentials();
    if (!creds) return [];
    const client = managementClient(creds);
    try {
      return (await client.listIndexes()).map((i) => ({ name: i.name, docCount: i.docCount, status: String(i.status) }));
    } finally {
      await client.close();
    }
  },
});

/**
 * Ops: deletes one of the old per-deployment indexes ("countersign-vendors-<deployment>") that the shared
 * index replaced. Any other name is refused, so it can't touch a teammate's other indexes.
 */
export const deleteLegacyIndex = internalAction({
  args: { name: v.string() },
  handler: async (_ctx, { name }): Promise<{ deleted: boolean; reason?: string }> => {
    if (!/^countersign-vendors-[a-z0-9-]+$/.test(name)) {
      return { deleted: false, reason: "only old countersign-vendors-<deployment> indexes can be deleted here" };
    }
    const creds = credentials();
    if (!creds) return { deleted: false, reason: NOT_SET_UP };
    const client = managementClient(creds);
    try {
      if (!(await client.listIndexes()).some((i) => i.name === name)) return { deleted: false, reason: "no such index" };
      await client.deleteIndex(name);
      return { deleted: true };
    } finally {
      await client.close();
    }
  },
});

/** Syncs this deployment's vendor names into the shared index. The seed schedules it; safe to re-run. */
export const syncVendorIndex = internalAction({
  args: {},
  handler: async (ctx): Promise<SyncResult> => {
    const scope = vendorScope(slug());
    const creds = credentials();
    if (!creds) return { ok: false, index: MOSS_INDEX, scope, docCount: 0, reason: NOT_SET_UP };
    const book: VerificationBook = await ctx.runQuery(internal.agents.vendorVerifier.loadVerificationBook, {});
    // Vendor ids change on every seed, so this deployment's documents are replaced as a set.
    return syncScope(creds, scope, vendorSearchDocs(book.vendors, slug()));
  },
});

/** Syncs the shared policy sentences (shared/verification/policyLookup.ts). Any deployment may run it. */
export const syncPolicyIndex = internalAction({
  args: {},
  handler: async (): Promise<SyncResult> => {
    const creds = credentials();
    if (!creds) return { ok: false, index: MOSS_INDEX, scope: POLICY_SCOPE, docCount: 0, reason: NOT_SET_UP };
    return syncScope(creds, POLICY_SCOPE, policySearchDocs());
  },
});

// ---- Queries ----

/**
 * The mid-call lookup for both voice agents: the Countersign policy that answers a caller's or vendor's
 * question ("why do you need to call them?", "can I pay in gift cards?"). Policy only, never invoice,
 * amount or account details (see policyLookup.ts). Falls back to keyword matching when Moss is unavailable.
 * `minScore` and `budgetMs` are for tuning and warm-up; the voice tools use the defaults.
 */
export const lookupPolicy = internalAction({
  args: { question: v.string(), minScore: v.optional(v.number()), budgetMs: v.optional(v.number()) },
  handler: async (_ctx, { question, minScore, budgetMs }): Promise<PolicyAnswer> => {
    const asked = question.trim().slice(0, 500);
    const creds = credentials();
    let fromMoss: PolicyDoc[] = [];
    if (creds && asked !== "") {
      const found = ask(creds, { type: "query", index: MOSS_INDEX, query: asked, topK: 4, filter: scopeFilter(POLICY_SCOPE) })
        .then((hits) => docsFromHits(hits, minScore))
        .catch((err: unknown): PolicyDoc[] => {
          console.warn(`[moss] policy lookup failed: ${describeError(err)}`);
          return [];
        });
      fromMoss = await withTimeout(found, budgetMs ?? POLICY_LOOKUP_BUDGET_MS, []);
    }
    const docs = mergeRankings(fromMoss, rankPolicyByKeywords(asked));
    return policyAnswer(docs, fromMoss.length > 0 ? "moss" : "keywords");
  },
});

/**
 * This deployment's vendors whose name or alias is close to `query`. [] when Moss isn't set up, fails, or
 * runs past its budget. `minScore` and `budgetMs` are for tuning and warm-up; the agents use the defaults.
 */
export const searchVendors = internalAction({
  args: { query: v.string(), minScore: v.optional(v.number()), budgetMs: v.optional(v.number()) },
  handler: async (_ctx, { query, minScore, budgetMs }): Promise<SearchHit[]> => {
    const creds = credentials();
    if (!creds || query.trim() === "") return [];
    const filter = scopeFilter(vendorScope(slug()));
    const hits = ask(creds, { type: "query", index: MOSS_INDEX, query, topK: 10, filter })
      .then((docs) => toSearchHits(docs, minScore ?? MOSS_MIN_SCORE))
      .catch((err: unknown): SearchHit[] => {
        console.warn(`[moss] search failed: ${describeError(err)}`);
        return [];
      });
    return withTimeout(hits, budgetMs ?? MOSS_SEARCH_BUDGET_MS, []);
  },
});
