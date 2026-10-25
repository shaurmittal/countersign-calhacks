// @vitest-environment edge-runtime
// 2c: a bank-detail change on /bank goes through Countersign (callback to the number on file) before the bank
// applies it. Real pipeline, real Policy Engine, real callback state machine; the verifier/risk agents return
// what they would for this request, and Cartesia's dial is mocked.
import { convexTest } from "convex-test";
import { Secret, TOTP } from "otpauth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { VendorFindings } from "../shared/types";
import { templateReply } from "../shared/reply";
import { extractPaymentRequest } from "./lib/claude";
import { runVendorVerifier } from "./agents/vendorVerifier";
import { BANK_SENDER } from "./bank";

vi.mock("./lib/claude", () => ({
  extractPaymentRequest: vi.fn(),
  composeReply: vi.fn(async ({ result, ctx }) => ({ text: templateReply(result, ctx), source: "template" })),
}));
vi.mock("./agents/vendorVerifier", () => ({ runVendorVerifier: vi.fn() }));
vi.mock("./agents/riskAnalyst", () => ({
  runRiskAnalyst: vi.fn(async () => ({ riskScore: 40, flags: ["bank_change"], explanation: "" })),
}));
vi.mock("./lib/cartesia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/cartesia")>()),
  placeOutboundCall: vi.fn(async () => "call_test"),
}));

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const codeNow = () => TOTP.generate({ secret: Secret.fromBase32(SECRET), timestamp: Date.now() });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubEnv("OWNER_TOTP_SECRET", SECRET);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const makeTest = () => convexTest(schema, modules);
type T = ReturnType<typeof makeTest>;

async function setup() {
  const t = makeTest();
  await t.mutation(internal.seed.run, {});
  const { pixel, payee, openInvoice } = await t.run(async (ctx) => {
    const pixel = (await ctx.db.query("vendors").collect()).find((v) => v.name === "Pixel & Pine Design")!;
    const payee = await ctx.db.query("bankPayees").withIndex("by_vendor", (q) => q.eq("vendorId", pixel._id)).first();
    const openInvoice = (await ctx.db.query("invoices").collect()).find((i) => i.vendorId === pixel._id && i.status === "open");
    return { pixel, payee: payee!, openInvoice };
  });
  // What the real verifier returns: with no invoice number or amount it matches the vendor's only open
  // invoice (Pixel's $4,800). The pipeline must drop it for a bank case, or a confirmed change could pay it.
  expect(openInvoice).toBeDefined();
  const findings: VendorFindings = {
    vendorId: pixel._id,
    matchConfidence: 1,
    senderOnFile: false,
    bankMatches: false,
    crs: { status: "not_checked" },
    ofacHit: false,
    matchingInvoiceId: openInvoice!._id,
    alreadyPaidAt: null,
  };
  vi.mocked(runVendorVerifier).mockResolvedValue(findings);
  return { t, pixel, payee };
}

const step = async (t: T) => {
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
};
const drain = (t: T) => t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(5_000), 1_000);
const getPayee = (t: T, id: Id<"bankPayees">) => t.run((ctx) => ctx.db.get(id));

async function requestChange(t: T, payeeId: Id<"bankPayees">) {
  const { caseId } = await t.mutation(api.bank.requestBankChange, { payeeId, routing: "021000021", account: "55519921" });
  return caseId as Id<"cases">;
}

/** Runs the pipeline until the callback is ringing, then answers it as the vendor. */
async function answerCallback(t: T, caseId: Id<"cases">, outcome: "denied" | "confirmed" | "no_answer") {
  await step(t);
  await step(t);
  const [cb] = await t.run((ctx) => ctx.db.query("callbacks").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect());
  expect(cb).toBeDefined();
  await t.mutation(internal.agents.callbackVerifier.recordOutcome, { callbackId: cb._id, outcome });
  await drain(t);
}

describe("bank-detail change through Countersign", () => {
  it("freezes the payee and opens a bank case with the request filled in (no LLM intake)", async () => {
    const { t, payee } = await setup();
    const caseId = await requestChange(t, payee._id);

    const frozen = await getPayee(t, payee._id);
    expect(frozen).toMatchObject({ status: "frozen", accountLast4: "4417", note: "Frozen: Countersign is calling Pixel & Pine Design" });
    expect(frozen?.pendingChange).toMatchObject({ routing: "021000021", accountLast4: "9921", caseId });

    await step(t);
    await step(t);
    const c = await t.run((ctx) => ctx.db.get(caseId));
    expect(c).toMatchObject({ channel: "bank", fromAddress: BANK_SENDER, status: "CALLBACK_PENDING", decision: "HOLD" });
    expect(c?.request).toMatchObject({ requestedAction: "change_bank", newBankDetails: { routing: "021000021", account: "55519921" } });
    expect(c?.policyResult.firedRules).toEqual(expect.arrayContaining(["R2", "R3"]));
    expect(c?.vendorFindings?.matchingInvoiceId).toBeNull();
    expect(extractPaymentRequest).not.toHaveBeenCalled();
  });

  it("vendor denies -> BLOCK, change refused, payee active on its old account, bank not marked known-bad", async () => {
    const { t, pixel, payee } = await setup();
    const caseId = await requestChange(t, payee._id);
    await answerCallback(t, caseId, "denied");

    const c = await t.run((ctx) => ctx.db.get(caseId));
    expect(c).toMatchObject({ status: "CLOSED", decision: "BLOCK" });
    const after = await getPayee(t, payee._id);
    expect(after).toMatchObject({
      status: "active",
      accountLast4: "4417",
      routing: payee.routing,
      note: "Change refused: Pixel & Pine Design said they didn't ask for this",
    });
    expect(after?.pendingChange).toBeUndefined();
    const vendor = await t.run((ctx) => ctx.db.get(pixel._id));
    expect(vendor?.knownBadSenders ?? []).not.toContain(BANK_SENDER);
    expect(vendor?.bankLast4).toBe("4417");
  });

  it("vendor confirms -> never PAY; the payee stays frozen for Priya", async () => {
    const { t, payee } = await setup();
    const caseId = await requestChange(t, payee._id);
    await answerCallback(t, caseId, "confirmed");

    const c = await t.run((ctx) => ctx.db.get(caseId));
    expect(c?.status).toBe("CLOSED");
    expect(c?.decision).not.toBe("PAY");
    expect(await t.run((ctx) => ctx.db.query("approvals").collect())).toHaveLength(0); // no $4,800 approval on /owner
    expect(await getPayee(t, payee._id)).toMatchObject({ status: "frozen", note: "Vendor confirmed by phone; Priya must approve on /owner" });
    expect(await t.run((ctx) => ctx.db.query("payments").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("bankTransfers").collect())).toHaveLength(0);
  });

  it("nobody answers (twice) -> stays frozen", async () => {
    const { t, payee } = await setup();
    const caseId = await requestChange(t, payee._id);
    await answerCallback(t, caseId, "no_answer");
    const second = (await t.run((ctx) => ctx.db.query("callbacks").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect())).find((cb) => !cb.outcome);
    if (second) {
      await t.mutation(internal.agents.callbackVerifier.recordOutcome, { callbackId: second._id, outcome: "no_answer" });
      await drain(t);
    }
    expect((await t.run((ctx) => ctx.db.get(caseId)))?.status).toBe("CLOSED");
    expect(await getPayee(t, payee._id)).toMatchObject({ status: "frozen", note: "Couldn't confirm with Pixel & Pine Design; the change stays frozen" });
  });

  it("a frozen payee refuses countersigned payments until it's settled", async () => {
    const { t, payee } = await setup();
    await requestChange(t, payee._id);
    const p = await getPayee(t, payee._id);
    expect(p?.status).toBe("frozen"); // bank/verify.ts rejects with payee_frozen (covered in bank.test.ts)
  });

  it("validates input and refuses a second change while one is pending", async () => {
    const { t, payee } = await setup();
    await expect(t.mutation(api.bank.requestBankChange, { payeeId: payee._id, routing: "123", account: "55519921" })).rejects.toThrow(/9 digits/);
    await expect(t.mutation(api.bank.requestBankChange, { payeeId: payee._id, routing: "021000021", account: "12" })).rejects.toThrow(/4 to 17/);
    await expect(t.mutation(api.bank.requestBankChange, { payeeId: payee._id, routing: payee.routing, account: "00004417" })).rejects.toThrow(/already on file/);
    await requestChange(t, payee._id);
    await expect(requestChange(t, payee._id)).rejects.toThrow(/already frozen/);
  });

  it("caps change requests at 5 every 10 minutes", async () => {
    const { t } = await setup();
    const payees = await t.run((ctx) => ctx.db.query("bankPayees").collect());
    for (const p of payees) await t.mutation(api.bank.requestBankChange, { payeeId: p._id, routing: "021000021", account: "55519921" });
    await t.mutation(internal.bank.unfreezePayee, { name: payees[0].name });
    await t.mutation(api.bank.requestBankChange, { payeeId: payees[0]._id, routing: "021000021", account: "55519921" });
    await t.mutation(internal.bank.unfreezePayee, { name: payees[1].name });
    await expect(t.mutation(api.bank.requestBankChange, { payeeId: payees[1]._id, routing: "021000021", account: "55519921" })).rejects.toThrow(/Too many/);
  });

  it("unfreezePayee puts a payee back on its details on file", async () => {
    const { t, payee } = await setup();
    await requestChange(t, payee._id);
    expect(await t.mutation(internal.bank.unfreezePayee, { name: "Pixel & Pine Design" })).toEqual({ unfrozen: 1 });
    const after = await getPayee(t, payee._id);
    expect(after).toMatchObject({ status: "active", accountLast4: "4417" });
    expect(after?.pendingChange).toBeUndefined();
    expect(after?.note).toBeUndefined();
  });
});

describe("Priya approves or declines a confirmed change on /owner", () => {
  async function confirmed() {
    const ctx = await setup();
    const caseId = await requestChange(ctx.t, ctx.payee._id);
    await answerCallback(ctx.t, caseId, "confirmed");
    return { ...ctx, caseId };
  }

  it("a confirmed change waits on /owner, with an alert in the owner feed", async () => {
    const { t, payee } = await confirmed();
    expect(await t.query(api.bank.pendingChanges, {})).toEqual([
      expect.objectContaining({ payeeId: payee._id, name: "Pixel & Pine Design", fromLast4: "4417", toLast4: "9921", toRouting: "021000021" }),
    ]);
    const feed = await t.query(api.owner.feed, {});
    expect(feed.some((f) => f.text.startsWith("Approval needed: Pixel & Pine Design confirmed by phone"))).toBe(true);
  });

  it("approve with her code: the vendor book and the bank payee move to the new account, nothing is paid", async () => {
    const { t, pixel, payee } = await confirmed();
    const res = await t.mutation(api.bank.decideBankChange, { payeeId: payee._id, code: codeNow(), action: "approve" });
    expect(res).toEqual({ ok: true, message: "Approved. Pixel & Pine Design is now paid to the account ending 9921." });

    expect(await t.run((ctx) => ctx.db.get(pixel._id))).toMatchObject({ bankRouting: "021000021", bankLast4: "9921" });
    const after = await getPayee(t, payee._id);
    expect(after).toMatchObject({ status: "active", routing: "021000021", accountLast4: "9921" });
    expect(after?.pendingChange).toBeUndefined();
    const { payees } = await t.query(api.bank.overview, {});
    expect(payees.find((p) => p._id === payee._id)).toMatchObject({ noteOk: true, note: expect.stringContaining("approved") });
    expect(await t.query(api.bank.pendingChanges, {})).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("payments").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("bankTransfers").collect())).toHaveLength(0);
    const audit = await t.run((ctx) => ctx.db.query("auditEvents").collect());
    expect(audit.find((e) => e.action === "vendor.bank_updated")).toMatchObject({ actor: "owner", payload: { fromLast4: "4417", toLast4: "9921" } });
  });

  it("decline with her code: the payee stays on its old account", async () => {
    const { t, pixel, payee } = await confirmed();
    const res = await t.mutation(api.bank.decideBankChange, { payeeId: payee._id, code: codeNow(), action: "decline" });
    expect(res).toMatchObject({ ok: true });
    expect(await getPayee(t, payee._id)).toMatchObject({ status: "active", routing: payee.routing, accountLast4: "4417" });
    expect((await t.run((ctx) => ctx.db.get(pixel._id)))?.bankLast4).toBe("4417");
  });

  it("a wrong code changes nothing, and five lock the change for a minute (even against the right code)", async () => {
    const { t, payee } = await confirmed();
    const wrong = codeNow() === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      expect(await t.mutation(api.bank.decideBankChange, { payeeId: payee._id, code: wrong, action: "approve" })).toMatchObject({ ok: false });
    }
    const locked = await t.mutation(api.bank.decideBankChange, { payeeId: payee._id, code: codeNow(), action: "approve" });
    expect(locked).toMatchObject({ ok: false, error: expect.stringMatching(/Too many wrong codes/) });
    expect(await getPayee(t, payee._id)).toMatchObject({ status: "frozen", accountLast4: "4417" });
  });

  it("can't approve a change the vendor never confirmed", async () => {
    const { t, payee } = await setup();
    const caseId = await requestChange(t, payee._id);
    const early = await t.mutation(api.bank.decideBankChange, { payeeId: payee._id, code: codeNow(), action: "approve" });
    expect(early).toEqual({ ok: false, error: "This payee has no confirmed change waiting for you." });

    await answerCallback(t, caseId, "denied");
    const late = await t.mutation(api.bank.decideBankChange, { payeeId: payee._id, code: codeNow(), action: "approve" });
    expect(late).toMatchObject({ ok: false });
    expect((await getPayee(t, payee._id))?.accountLast4).toBe("4417");
  });

  it("refuses if the confirmed flag is set but the callback didn't actually confirm", async () => {
    const { t, payee } = await setup();
    const caseId = await requestChange(t, payee._id);
    await answerCallback(t, caseId, "no_answer");
    await t.run(async (ctx) => {
      const p = (await ctx.db.get(payee._id))!;
      await ctx.db.patch(payee._id, { status: "frozen", pendingChange: { ...p.pendingChange!, confirmedAt: Date.now() } });
    });
    const res = await t.mutation(api.bank.decideBankChange, { payeeId: payee._id, code: codeNow(), action: "approve" });
    expect(res).toEqual({ ok: false, error: "The vendor never confirmed this change by phone." });
  });
});
