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
const STEP_MS = 30_000;
const WRONG = "000000";

const codeNow = () => TOTP.generate({ secret: Secret.fromBase32(SECRET), timestamp: Date.now() });
const nextStep = () => vi.setSystemTime(Date.now() + STEP_MS);

const makeTest = () => convexTest(schema, modules);
type T = ReturnType<typeof makeTest>;

/** A seeded backend: the owner row holds the TOTP replay counter. */
async function setup() {
  const t = makeTest();
  await t.mutation(internal.seed.run, {});
  return t;
}

/** A case waiting on the owner, optionally already approved and inside a 60 s cooling-off. */
async function waitingCase(t: T, o: { approved?: boolean; coolingOffSeconds?: number } = {}): Promise<Id<"cases">> {
  return t.run(async (ctx) => {
    const now = Date.now();
    const caseId = await ctx.db.insert("cases", {
      channel: "web",
      fromAddress: `web:test-session-${Math.random().toString(36).slice(2, 10)}`,
      rawContent: "Pay Harbor Legal HL-9000",
      status: "AWAITING_OWNER",
      decision: o.approved ? "HOLD" : "ESCALATE",
      flags: [],
      policyResult: {
        decision: "ESCALATE",
        firedRules: ["R6"],
        reasons: ["R6 Over limit: test"],
        needs: { callback: false, ownerOtp: true, coolingOffSeconds: o.coolingOffSeconds ?? 60 },
        overridable: true,
      },
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("approvals", {
      caseId,
      method: "otp",
      requestedAt: now,
      ...(o.approved && { approvedAt: now, coolingOffUntil: now + 60_000 }),
    });
    return caseId;
  });
}

const approvals = (t: T, caseId: Id<"cases">) =>
  t.run((ctx) => ctx.db.query("approvals").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect());
const submit = (t: T, caseId: Id<"cases">, code: string, action: "approve" | "decline" | "cancel") =>
  t.mutation(api.agents.ownerConcierge.submitCode, { caseId, code, action });

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
    const t = await setup();
    const caseId = await waitingCase(t, { approved: true });

    for (let i = 0; i < 5; i++) expect(await submit(t, caseId, WRONG, "cancel")).toMatchObject({ ok: false });
    const [locked] = await approvals(t, caseId);
    expect(locked.lockedUntil).toBeGreaterThan(Date.now());

    expect(await submit(t, caseId, codeNow(), "cancel")).toEqual({ ok: true, message: "Cancelled. Nothing will be paid." });
    expect((await approvals(t, caseId))[0].cancelledAt).toBe(Date.now());
  });

  it("a cancel still needs the right code while locked", async () => {
    const t = await setup();
    const caseId = await waitingCase(t, { approved: true });
    for (let i = 0; i < 6; i++) expect(await submit(t, caseId, WRONG, "cancel")).toMatchObject({ ok: false });
    expect((await approvals(t, caseId))[0].cancelledAt).toBeUndefined();
  });

  it("the lock still applies to approve", async () => {
    const t = await setup();
    const caseId = await waitingCase(t);
    for (let i = 0; i < 5; i++) await submit(t, caseId, WRONG, "approve");
    expect(await submit(t, caseId, codeNow(), "approve")).toMatchObject({ ok: false, error: expect.stringContaining("Too many wrong codes") });
    expect((await approvals(t, caseId))[0].approvedAt).toBeUndefined();
  });

  it("a declined case leaves the owner page at once, before the pipeline closes it", async () => {
    const t = await setup();
    const caseId = await waitingCase(t);
    expect(await t.query(api.owner.pending, {})).toHaveLength(1);
    expect(await submit(t, caseId, codeNow(), "decline")).toMatchObject({ ok: true });
    // Still AWAITING_OWNER until the scheduled advance runs; the page must not offer its buttons again.
    expect((await t.run((ctx) => ctx.db.get(caseId)))?.status).toBe("AWAITING_OWNER");
    expect(await t.query(api.owner.pending, {})).toHaveLength(0);
  });

  it("a policy with no cooling-off approves with coolingOffUntil = now, so the engine never waits for it", async () => {
    const t = await setup();
    const caseId = await waitingCase(t, { coolingOffSeconds: 0 });
    expect(await submit(t, caseId, codeNow(), "approve")).toEqual({ ok: true, message: "Approved. Countersign is releasing the payment." });
    const [a] = await approvals(t, caseId);
    expect(a.approvedAt).toBe(Date.now());
    expect(a.coolingOffUntil).toBe(Date.now());

    nextStep();
    const withCooling = await waitingCase(t, { coolingOffSeconds: 60 });
    expect(await submit(t, withCooling, codeNow(), "approve")).toMatchObject({ ok: true, message: expect.stringContaining("released in 60s") });
    expect((await approvals(t, withCooling))[0].coolingOffUntil).toBe(Date.now() + 60_000);
  });

  it("without the owner row (seed never run) every code is refused, right or wrong", async () => {
    const t = makeTest();
    const caseId = await waitingCase(t);
    expect(await submit(t, caseId, codeNow(), "approve")).toMatchObject({ ok: false, error: expect.stringContaining("not set up") });
    expect((await approvals(t, caseId))[0].approvedAt).toBeUndefined();
  });
});
