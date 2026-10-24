// @vitest-environment edge-runtime
// The lookup_policy voice tool against an in-memory Convex backend (convex-test). P3's Moss action is
// replaced by a stub, so nothing calls Moss.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const SECRET = "test-tool-secret";
const ANSWER = { message: "Countersign policy: An unconfirmed bank change is never paid.", rules: ["R2", "R3"], source: "moss" };

const moss = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("../agents/moss", async () => {
  const { internalAction } = await import("../_generated/server");
  const { v } = await import("convex/values");
  return {
    lookupPolicy: internalAction({
      args: { question: v.string(), minScore: v.optional(v.number()), budgetMs: v.optional(v.number()) },
      handler: async (_ctx, { question }) => moss.lookup(question),
    }),
  };
});

const makeTest = () => convexTest(schema, modules);
type T = ReturnType<typeof makeTest>;

function ask(t: T, body: Record<string, unknown>, secret: string | null = SECRET) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["X-Countersign-Secret"] = secret;
  return t.fetch("/cartesia/tools/policy", { method: "POST", headers, body: JSON.stringify(body) });
}

const lookups = (t: T) =>
  t.run((ctx) => ctx.db.query("auditEvents").collect()).then((rows) => rows.filter((e) => e.action === "policy.lookup"));

async function callCase(t: T, conversationId: string): Promise<Id<"cases">> {
  const opened = await t.mutation(internal.channels.voice.openCallCase, {
    fromAddress: "+15555550123",
    rawContent: "Pixel & Pine here, our bank changed",
    externalId: `call:${conversationId}:abcd1234`,
  });
  return opened!.caseId;
}

beforeEach(() => {
  vi.useFakeTimers(); // the scheduled pipeline run stays queued: these tests stop at the audit row
  vi.stubEnv("CARTESIA_TOOL_SECRET", SECRET);
  moss.lookup.mockResolvedValue(ANSWER);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  moss.lookup.mockReset();
});

describe("lookup_policy tool", () => {
  it("rejects a missing or wrong secret without looking anything up", async () => {
    const t = makeTest();
    expect((await ask(t, { question: "why" }, null)).status).toBe(401);
    expect((await ask(t, { question: "why" }, "test-tool-secreX")).status).toBe(401);
    expect(moss.lookup).not.toHaveBeenCalled();
  });

  it("asks for a question with a 200, so the agent retries instead of giving up", async () => {
    const res = await ask(makeTest(), { question: "  " });
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/question is required/);
    expect(moss.lookup).not.toHaveBeenCalled();
  });

  it("answers with the policy and audits it on the call's case", async () => {
    const t = makeTest();
    const caseId = await callCase(t, "conv-1");
    const res = await ask(t, { question: "caller asks why the vendor must be called", conversation_id: "conv-1" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(ANSWER.message);
    expect(moss.lookup).toHaveBeenCalledWith("caller asks why the vendor must be called");
    const [event] = await lookups(t);
    expect(event).toMatchObject({
      caseId,
      actor: "moss",
      payload: { agent: "inbound", question: "caller asks why the vendor must be called", rules: ["R2", "R3"], source: "moss" },
    });
  });

  it("audits a callback agent's lookup on the callback's case", async () => {
    const t = makeTest();
    const caseId = await callCase(t, "conv-2");
    const callbackId = await t.run(async (ctx) => {
      const vendorId = await ctx.db.insert("vendors", {
        name: "Pixel & Pine",
        aliases: [],
        domains: [],
        phoneOnFile: "+15555550100",
        emailsOnFile: [],
        bankLast4: "4417",
        bankRouting: "021000021",
        typicalAmountRange: [100_000, 500_000],
        cadence: "monthly",
      });
      return ctx.db.insert("callbacks", { caseId, vendorId, numberDialed: "+15555550100", attempt: 1, startedAt: Date.now() });
    });
    moss.lookup.mockResolvedValue({ ...ANSWER, source: "keywords" });
    await ask(t, { question: "vendor asks why they are being called", callback_id: callbackId, conversation_id: "other" });
    const [event] = await lookups(t);
    expect(event).toMatchObject({ caseId, actor: "keywords", payload: { agent: "callback", source: "keywords" } });
  });

  it("still answers before any case exists, and audits nothing", async () => {
    const t = makeTest();
    const res = await ask(t, { question: "what is this", conversation_id: "conv-none" });
    expect(await res.text()).toBe(ANSWER.message);
    expect(await lookups(t)).toHaveLength(0);
  });

  it("falls back to a safe line when the lookup fails", async () => {
    const t = makeTest();
    moss.lookup.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await ask(t, { question: "why" });
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/couldn't be looked up/);
  });
});

describe("get_case_status reads only a current reply", () => {
  const status = (t: T, caseId: Id<"cases">) => t.query(internal.channels.voice.statusForVoice, { caseId, conversationId: "" });
  const update = (t: T, caseId: Id<"cases">, fields: Record<string, unknown>) =>
    t.mutation(internal.cases.update, { caseId, ...fields });

  it("keeps polling while a closed case still carries the callback stage's reply", async () => {
    const t = makeTest();
    const caseId = await callCase(t, "conv-3");
    await update(t, caseId, { status: "CALLBACK_PENDING" });
    await update(t, caseId, { replyText: "I'm calling them now on the number we have on file." });
    await update(t, caseId, { status: "CLOSED", decision: "BLOCK" });
    expect((await status(t, caseId)).final).toBe(false);

    await update(t, caseId, { replyText: "We can't make this payment." });
    const done = await status(t, caseId);
    expect(done.final).toBe(true);
    expect(done.message).toMatch(/We can't make this payment/);
  });

  it("isn't thrown by the leader re-setting the same status", async () => {
    const t = makeTest();
    const caseId = await callCase(t, "conv-4");
    await update(t, caseId, { status: "AWAITING_OWNER", decision: "ESCALATE" });
    await update(t, caseId, { replyText: "This payment needs the business owner's approval." });
    await update(t, caseId, { status: "AWAITING_OWNER" });
    expect((await status(t, caseId)).final).toBe(true);
  });
});
