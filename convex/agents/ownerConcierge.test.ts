// @vitest-environment edge-runtime
// The owner's code entry against an in-memory Convex backend (convex-test). Case ids are public, so the
// wrong-code lock must never stop the owner from cancelling a payment inside its cooling-off window.
import { convexTest } from "convex-test";
import { Secret, TOTP } from "otpauth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const T0 = Date.UTC(2026, 9, 24, 18, 0, 5);
const WRONG = "000000";

const codeNow = () => TOTP.generate({ secret: Secret.fromBase32(SECRET), timestamp: Date.now() });

const makeTest = () => convexTest(schema, modules);
type T = ReturnType<typeof makeTest>;

/** A case the owner has already approved, 60 s into a 60 s cooling-off, as `advance` leaves it. */
async function approvedCase(t: T): Promise<Id<"cases">> {
  return t.run(async (ctx) => {
    const now = Date.now();
    const caseId = await ctx.db.insert("cases", {
      channel: "web",
      fromAddress: "web:test-session-0001",
      rawContent: "Pay Harbor Legal HL-9000",
      status: "AWAITING_OWNER",
      decision: "HOLD",
      flags: [],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("approvals", { caseId, method: "otp", requestedAt: now, approvedAt: now, coolingOffUntil: now + 60_000 });
    return caseId;
  });
}

const approvals = (t: T, caseId: Id<"cases">) =>
  t.run((ctx) => ctx.db.query("approvals").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("OWNER_TOTP_SECRET", SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("ownerConcierge.submitCode", () => {
  it("five wrong codes from anyone do not stop the owner's cancel during cooling-off", async () => {
    const t = makeTest();
    await t.mutation(internal.seed.run, {}); // the owner row holds the TOTP replay counter
    const caseId = await approvedCase(t);

    for (let i = 0; i < 5; i++) {
      expect(await t.mutation(api.agents.ownerConcierge.submitCode, { caseId, code: WRONG, action: "cancel" })).toMatchObject({ ok: false });
    }
    const [locked] = await approvals(t, caseId);
    expect(locked.lockedUntil).toBeGreaterThan(Date.now());

    const cancelled = await t.mutation(api.agents.ownerConcierge.submitCode, { caseId, code: codeNow(), action: "cancel" });
    expect(cancelled).toEqual({ ok: true, message: "Cancelled. Nothing will be paid." });
    expect((await approvals(t, caseId))[0].cancelledAt).toBe(Date.now());
  });

  it("a cancel still needs the right code while locked", async () => {
    const t = makeTest();
    const caseId = await approvedCase(t);
    for (let i = 0; i < 6; i++) {
      expect(await t.mutation(api.agents.ownerConcierge.submitCode, { caseId, code: WRONG, action: "cancel" })).toMatchObject({ ok: false });
    }
    expect((await approvals(t, caseId))[0].cancelledAt).toBeUndefined();
  });

  it("the lock still applies to approve", async () => {
    const t = makeTest();
    const caseId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("cases", {
        channel: "web",
        fromAddress: "web:test-session-0002",
        rawContent: "Pay Harbor Legal HL-9000",
        status: "AWAITING_OWNER",
        decision: "ESCALATE",
        flags: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("approvals", { caseId: id, method: "otp", requestedAt: now });
      return id;
    });
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.agents.ownerConcierge.submitCode, { caseId, code: WRONG, action: "approve" });
    }
    const res = await t.mutation(api.agents.ownerConcierge.submitCode, { caseId, code: codeNow(), action: "approve" });
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("Too many wrong codes") });
    expect((await approvals(t, caseId))[0].approvedAt).toBeUndefined();
  });
});
