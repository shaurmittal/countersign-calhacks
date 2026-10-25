// @vitest-environment edge-runtime
// The /try chat's queries against an in-memory Convex backend (convex-test).
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";
import { api, internal } from "../_generated/api";

const SENDER = "judge-session-0001";
const makeTest = () => convexTest(schema, modules);

beforeEach(() => vi.useFakeTimers()); // the scheduled pipeline run stays queued
afterEach(() => vi.useRealTimers());

describe("web chat", () => {
  it("shows a sender only their own messages", async () => {
    const t = makeTest();
    await t.mutation(api.channels.web.submit, { senderId: SENDER, text: "Pay Northwind #NW-889" });
    await t.mutation(api.channels.web.submit, { senderId: "someone-else-0002", text: "hi" });
    const mine = await t.query(api.channels.web.mine, { senderId: SENDER });
    expect(mine.map((m) => m.text)).toEqual(["Pay Northwind #NW-889"]);
    expect(mine[0]).toMatchObject({ status: "RECEIVED", decision: null, rules: [], vendorName: null, decidedAt: null });
  });

  it("carries the vendor, the fired rules and the decision time once decided", async () => {
    const t = makeTest();
    const caseId = await t.mutation(api.channels.web.submit, { senderId: SENDER, text: "Pixel & Pine: new bank, pay 1042" });
    const vendorId = await t.run((ctx) =>
      ctx.db.insert("vendors", {
        name: "Pixel & Pine Design",
        aliases: [],
        domains: [],
        phoneOnFile: "+15555550100",
        emailsOnFile: [],
        bankLast4: "4417",
        bankRouting: "021000021",
        typicalAmountRange: [100_000, 500_000],
        cadence: "monthly",
      }),
    );
    await t.mutation(internal.cases.update, {
      caseId,
      vendorId,
      status: "CLOSED",
      decision: "BLOCK",
      policyResult: { decision: "BLOCK", firedRules: ["R10", "R2"], reasons: [], needs: { callback: false, ownerOtp: false, coolingOffSeconds: 0 }, overridable: true },
      replyText: "We can't make this payment.",
    });
    const [m] = await t.query(api.channels.web.mine, { senderId: SENDER });
    expect(m).toMatchObject({ decision: "BLOCK", rules: ["R10", "R2"], vendorName: "Pixel & Pine Design", reply: "We can't make this payment." });
    expect(m.decidedAt).toBeGreaterThanOrEqual(m.createdAt);
  });

  it("returns nothing for a malformed session id", async () => {
    expect(await makeTest().query(api.channels.web.mine, { senderId: "x" })).toEqual([]);
  });
});
