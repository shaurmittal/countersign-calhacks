// @vitest-environment edge-runtime
// The Fetch.ai bridge's dedupe key against an in-memory Convex backend (convex-test).
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";

const SECRET = "test-bridge-secret";

const makeTest = () => convexTest(schema, modules);

const post = (t: ReturnType<typeof makeTest>, body: unknown) =>
  t.fetch("/agent/message", {
    method: "POST",
    headers: { "X-Agent-Bridge-Secret": SECRET, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.useFakeTimers(); // the scheduled pipeline run stays queued: these tests stop at the case row
  vi.stubEnv("AGENT_BRIDGE_SECRET", SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("agent bridge inboundMessage", () => {
  it("dedupes a repeated message from one sender, but not the same msgId from another sender", async () => {
    const t = makeTest();
    const a1 = (await (await post(t, { sender: "agent1q-alice", msgId: "m-1", text: "Pay Northwind #NW-889" })).json()) as { caseId: string };
    const a2 = (await (await post(t, { sender: "agent1q-alice", msgId: "m-1", text: "Pay Northwind #NW-889" })).json()) as { caseId: string };
    const b1 = (await (await post(t, { sender: "agent1q-bob", msgId: "m-1", text: "Pay Pixel & Pine 1042" })).json()) as { caseId: string };
    expect(a2.caseId).toBe(a1.caseId);
    expect(b1.caseId).not.toBe(a1.caseId);
    const cases = await t.run((ctx) => ctx.db.query("cases").collect());
    expect(cases.map((c) => [c.fromAddress, c.externalId])).toEqual(
      expect.arrayContaining([
        ["agent1q-alice", "agent:agent1q-alice:m-1"],
        ["agent1q-bob", "agent:agent1q-bob:m-1"],
      ]),
    );
    expect(cases).toHaveLength(2);
  });

  it("rejects a missing secret", async () => {
    const t = makeTest();
    const res = await t.fetch("/agent/message", { method: "POST", body: JSON.stringify({ sender: "x", msgId: "1", text: "hi" }) });
    expect(res.status).toBe(401);
  });
});
