// @vitest-environment edge-runtime
// The owner's block and trust lists against an in-memory Convex backend (convex-test): every change needs
// an authenticator code, wrong codes lock the lists, values leave masked, and the vendor-book loader only
// hands live entries to the P3 agents.
import { convexTest } from "convex-test";
import { Secret, TOTP } from "otpauth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { api, internal } from "./_generated/api";

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const T0 = Date.UTC(2026, 9, 24, 18, 0, 5);
const STEP_MS = 30_000;

/** The owner's code at the faked current time. Each list edit consumes a step, so tests move the clock on. */
const codeNow = () => TOTP.generate({ secret: Secret.fromBase32(SECRET), timestamp: Date.now() });
const nextStep = () => vi.setSystemTime(Date.now() + STEP_MS);

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const sam = await t.run(async (ctx) => (await ctx.db.query("vendors").collect()).find((v) => v.name === "Sam Ortiz")!);
  return { t, sam };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("OWNER_TOTP_SECRET", SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("senderLists", () => {
  it("adds a deny entry with a valid code; the list and the audit event show it masked", async () => {
    const { t } = await setup();
    const res = await t.mutation(api.senderLists.add, { kind: "deny", match: "phone", value: "+1 555 555 9001", code: codeNow() });
    expect(res).toMatchObject({ ok: true });

    const { entries } = await t.query(api.senderLists.list, {});
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "deny", match: "phone", value: "…9001", vendorName: null, expired: false });

    const audit = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((e) => e.action === "lists.added"));
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0].payload)).not.toContain("5555559001");
  });

  it("checks the input before the code, so a typo costs no strike", async () => {
    const { t, sam } = await setup();
    expect(await t.mutation(api.senderLists.add, { kind: "deny", match: "phone", value: "12345", code: "000000" })).toMatchObject({ ok: false });
    expect(await t.mutation(api.senderLists.add, { kind: "trust", match: "phone", value: "+15555550188", code: "000000" })).toEqual({
      ok: false,
      error: "Choose the vendor this sender belongs to.",
    });
    expect(
      await t.mutation(api.senderLists.add, { kind: "trust", match: "bank", value: "021000021 9921", vendorId: sam._id, code: "000000" }),
    ).toMatchObject({ ok: false });
    const owner = await t.run(async (ctx) => ctx.db.query("owner").first());
    expect(owner?.listCodeAttempts ?? 0).toBe(0);
  });

  it("locks list edits after five wrong codes, even for the right code", async () => {
    const { t } = await setup();
    for (let i = 0; i < 5; i++) {
      const res = await t.mutation(api.senderLists.add, { kind: "deny", match: "domain", value: "evil.example", code: "000000" });
      expect(res).toMatchObject({ ok: false });
    }
    const locked = await t.mutation(api.senderLists.add, { kind: "deny", match: "domain", value: "evil.example", code: codeNow() });
    expect(locked).toMatchObject({ ok: false, error: expect.stringContaining("Too many wrong codes") });
    expect((await t.query(api.senderLists.list, {})).entries).toHaveLength(0);

    vi.setSystemTime(Date.now() + 61_000);
    expect(await t.mutation(api.senderLists.add, { kind: "deny", match: "domain", value: "evil.example", code: codeNow() })).toMatchObject({ ok: true });
  });

  it("refuses a code that was already used", async () => {
    const { t } = await setup();
    const code = codeNow();
    expect(await t.mutation(api.senderLists.add, { kind: "deny", match: "domain", value: "evil.example", code })).toMatchObject({ ok: true });
    expect(await t.mutation(api.senderLists.add, { kind: "deny", match: "domain", value: "worse.example", code })).toMatchObject({
      ok: false,
      error: expect.stringContaining("already used"),
    });
  });

  it("works without a secret only to say so", async () => {
    vi.stubEnv("OWNER_TOTP_SECRET", "");
    const { t } = await setup();
    expect(await t.mutation(api.senderLists.add, { kind: "deny", match: "domain", value: "evil.example", code: "123456" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("OWNER_TOTP_SECRET"),
    });
  });

  it("removes with a fresh code, and the loader only hands live entries to the agents", async () => {
    const { t, sam } = await setup();
    await t.mutation(api.senderLists.add, { kind: "trust", match: "phone", value: "+15555550188", vendorId: sam._id, code: codeNow() });
    nextStep();
    await t.mutation(api.senderLists.add, { kind: "deny", match: "domain", value: "evil.example", code: codeNow() });
    nextStep();
    await t.mutation(api.senderLists.add, { kind: "deny", match: "email", value: "x@soon-gone.example", expiresInDays: 1, code: codeNow() });

    const { entries } = await t.query(api.senderLists.list, {});
    expect(entries.map((e) => e.value)).toEqual(["x…@soon-gone.example", "evil.example", "…0188"]);
    expect(entries.find((e) => e.kind === "trust")?.vendorName).toBe("Sam Ortiz");

    nextStep();
    const domain = entries.find((e) => e.value === "evil.example")!;
    expect(await t.mutation(api.senderLists.remove, { entryId: domain.id, code: codeNow() })).toMatchObject({ ok: true });

    vi.setSystemTime(Date.now() + 2 * 86_400_000); // the email entry has expired
    const book = await t.query(internal.agents.vendorVerifier.loadVerificationBook, {});
    expect(book.lists).toEqual([{ id: expect.any(String), kind: "trust", match: "phone", value: "15555550188", vendorId: sam._id }]);
    expect((await t.query(api.senderLists.list, {})).entries.map((e) => [e.value, e.expired])).toEqual([
      ["x…@soon-gone.example", true],
      ["…0188", false],
    ]);
  });

  it("adding the same entry twice keeps one", async () => {
    const { t } = await setup();
    await t.mutation(api.senderLists.add, { kind: "deny", match: "domain", value: "evil.example", code: codeNow() });
    nextStep();
    const again = await t.mutation(api.senderLists.add, { kind: "deny", match: "domain", value: "https://www.evil.example/pay", code: codeNow() });
    expect(again).toEqual({ ok: true, message: "That entry is already on the list." });
    expect((await t.query(api.senderLists.list, {})).entries).toHaveLength(1);
  });
});
