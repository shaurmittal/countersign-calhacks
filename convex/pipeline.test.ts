// @vitest-environment edge-runtime
// Leader pipeline flows against an in-memory Convex backend (convex-test).
// Claude and the P3/P4 agents are mocked; the Policy Engine, cases, audit chain and P2's real
// callback state machine run as written. Cartesia is mocked at the HTTP-helper level.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { PaymentRequest, VendorFindings } from "../shared/types";
import { templateReply } from "../shared/reply";
import { extractPaymentRequest } from "./lib/claude";
import { runVendorVerifier } from "./agents/vendorVerifier";
import { runPayer } from "./agents/payer";
import { placeOutboundCall } from "./lib/cartesia";

vi.mock("./lib/claude", () => ({
  extractPaymentRequest: vi.fn(),
  composeReply: vi.fn(async ({ result, ctx }) => ({ text: templateReply(result, ctx), source: "template" })),
}));
vi.mock("./agents/vendorVerifier", () => ({ runVendorVerifier: vi.fn() }));
vi.mock("./agents/riskAnalyst", () => ({
  runRiskAnalyst: vi.fn(async () => ({ riskScore: 0, flags: [], explanation: "" })),
}));
vi.mock("./agents/payer", () => ({
  runPayer: vi.fn(async () => ({ ok: true, paymentId: "pay_1", externalId: "ach_test_1" })),
}));
vi.mock("./lib/cartesia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/cartesia")>()),
  placeOutboundCall: vi.fn(async () => "call_test"),
}));

const REQUEST: PaymentRequest = {
  claimedVendorName: null,
  claimedSenderRole: "unknown",
  amountCents: null,
  currency: "USD",
  invoiceNumber: null,
  newBankDetails: null,
  urgencyClaims: [],
  requestedAction: "pay_invoice",
  injectionAttempt: false,
};
const NEW_BANK = { routing: "021000021", account: "55519921" };
const SCAMMER = "+15555559001";

const makeTest = () => convexTest(schema, modules);
type T = ReturnType<typeof makeTest>;

async function setup() {
  const t = makeTest();
  await t.mutation(internal.seed.run, {});
  const w = await t.run(async (ctx) => {
    const vendors = await ctx.db.query("vendors").collect();
    const invoices = await ctx.db.query("invoices").collect();
    const vendor = (name: string) => vendors.find((v) => v.name === name)!;
    const invoice = (n: string) => invoices.find((i) => i.number === n)!;
    return {
      pixel: vendor("Pixel & Pine Design"),
      northwind: vendor("Northwind Cloud"),
      harbor: vendor("Harbor Legal"),
      inv1042: invoice("1042"),
      nw889: invoice("NW-889"),
    };
  });
  return { t, w };
}

function findings(vendorId: string, invoiceId: string | null, o: Partial<VendorFindings> = {}): VendorFindings {
  return {
    vendorId,
    matchConfidence: 0.95,
    senderOnFile: false,
    bankMatches: null,
    crs: { status: "not_checked" },
    ofacHit: false,
    matchingInvoiceId: invoiceId,
    alreadyPaidAt: null,
    ...o,
  };
}

function given(request: Partial<PaymentRequest>, vf: VendorFindings | null) {
  vi.mocked(extractPaymentRequest).mockResolvedValue({ request: { ...REQUEST, ...request }, attempts: 1 });
  if (vf) vi.mocked(runVendorVerifier).mockResolvedValue(vf);
}

/** Advance fake time, then run every scheduled function that became due (one wave). */
async function step(t: T, ms = 0) {
  vi.advanceTimersByTime(ms);
  await t.finishInProgressScheduledFunctions();
}

/** Run scheduled functions until nothing is left, moving the clock in 5 s steps like real time would. */
async function drain(t: T) {
  await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(5_000), 1_000);
}

async function open(t: T, rawContent = "test", fromAddress = SCAMMER) {
  const { caseId } = await t.mutation(internal.cases.open, { channel: "web", fromAddress, rawContent });
  return caseId as Id<"cases">;
}

const getCase = (t: T, caseId: Id<"cases">) => t.run((ctx) => ctx.db.get(caseId));
const callbacksFor = (t: T, caseId: Id<"cases">) =>
  t.run((ctx) => ctx.db.query("callbacks").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect());
const approve = (t: T, caseId: Id<"cases">, o: { coolingOffUntil?: number; cancelledAt?: number } = {}) =>
  t.run((ctx) =>
    ctx.db.insert("approvals", { caseId, method: "otp", requestedAt: Date.now(), approvedAt: Date.now(), ...o }),
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("leader pipeline", () => {
  it("happy path: known vendor, open invoice, under limit -> PAY once, audit chain intact", async () => {
    const { t, w } = await setup();
    given({ claimedVendorName: "Northwind", invoiceNumber: "NW-889" }, findings(w.northwind._id, w.nw889._id));
    const caseId = await open(t, "Pay Northwind #NW-889");
    await drain(t);

    const c = await getCase(t, caseId);
    expect(c?.status).toBe("CLOSED");
    expect(c?.decision).toBe("PAY");
    expect(c?.replyText).toMatch(/has been paid/);
    expect(runPayer).toHaveBeenCalledTimes(1);
    expect(c?.payStartedAt).toBeTypeOf("number");
  });

  it("bank change, vendor denies on callback -> BLOCK, sender marked known-bad, never paid", async () => {
    const { t, w } = await setup();
    given(
      { claimedVendorName: "Pixel & Pine", claimedSenderRole: "vendor", invoiceNumber: "1042", newBankDetails: NEW_BANK },
      findings(w.pixel._id, w.inv1042._id, { bankMatches: false }),
    );
    const caseId = await open(t, "Pixel & Pine here, our bank changed, send #1042 to account 55519921");
    await step(t); // advance
    await step(t); // callback start + interim reply

    let c = await getCase(t, caseId);
    expect(c?.status).toBe("CALLBACK_PENDING");
    expect(c?.decision).toBe("HOLD");
    expect(c?.replyText).toMatch(/calling them now on the number we have on file/);

    const [cb] = await callbacksFor(t, caseId);
    expect(cb.numberDialed).toBe(w.pixel.phoneOnFile); // from the vendor record, never the request
    expect(vi.mocked(placeOutboundCall).mock.calls[0][0].toNumber).toBe(w.pixel.phoneOnFile);

    await t.mutation(internal.agents.callbackVerifier.recordOutcome, { callbackId: cb._id, outcome: "denied" });
    await drain(t);

    c = await getCase(t, caseId);
    expect(c?.status).toBe("CLOSED");
    expect(c?.decision).toBe("BLOCK");
    expect(c?.policyResult.firedRules).toEqual(expect.arrayContaining(["R2", "R3", "R10"]));
    expect(runPayer).not.toHaveBeenCalled();
    const pixel = await t.run((ctx) => ctx.db.get(w.pixel._id));
    expect(pixel?.knownBadSenders).toContain(SCAMMER);
    expect(pixel?.bankLast4).toBe("4417");
  });

  it("callback nobody answers -> one retry, then HOLD (bank changes are never paid unconfirmed)", async () => {
    const { t, w } = await setup();
    vi.mocked(placeOutboundCall)
      .mockRejectedValueOnce(new Error("no answer"))
      .mockRejectedValueOnce(new Error("no answer"));
    given(
      { claimedVendorName: "Pixel & Pine", claimedSenderRole: "vendor", invoiceNumber: "1042", newBankDetails: NEW_BANK },
      findings(w.pixel._id, w.inv1042._id, { bankMatches: false }),
    );
    const caseId = await open(t);
    await drain(t);

    const callbacks = await callbacksFor(t, caseId);
    expect(callbacks.map((cb) => [cb.attempt, cb.outcome])).toEqual([
      [1, "no_answer"],
      [2, "no_answer"],
    ]);
    const c = await getCase(t, caseId);
    expect(c?.status).toBe("CLOSED");
    expect(c?.decision).toBe("HOLD");
    expect(runPayer).not.toHaveBeenCalled();
  });

  it("genuine bank change: callback confirmed -> owner OTP -> vendor record updated (audited) -> PAY", async () => {
    const { t, w } = await setup();
    given(
      { claimedVendorName: "Pixel & Pine", claimedSenderRole: "vendor", invoiceNumber: "1042", newBankDetails: NEW_BANK },
      findings(w.pixel._id, w.inv1042._id, { bankMatches: false, senderOnFile: true }),
    );
    const caseId = await open(t, "new bank", "billing@pixelandpine.example");
    await step(t);
    await step(t);
    const [cb] = await callbacksFor(t, caseId);
    await t.mutation(internal.agents.callbackVerifier.recordOutcome, { callbackId: cb._id, outcome: "confirmed" });
    await drain(t);

    let c = await getCase(t, caseId);
    expect(c?.status).toBe("AWAITING_OWNER");
    expect(c?.decision).toBe("ESCALATE");
    expect(runPayer).not.toHaveBeenCalled();

    await approve(t, caseId);
    await t.action(internal.pipeline.advance, { caseId });
    await drain(t);

    c = await getCase(t, caseId);
    expect(c?.decision).toBe("PAY");
    expect(runPayer).toHaveBeenCalledTimes(1);
    const pixel = await t.run((ctx) => ctx.db.get(w.pixel._id));
    expect(pixel?.bankLast4).toBe("9921");
    const audit = await t.run((ctx) => ctx.db.query("auditEvents").collect());
    expect(audit.some((e) => e.action === "vendor.bank_updated")).toBe(true);
  });

  it("over the auto-pay limit -> ESCALATE, waits for the owner, PAY after OTP", async () => {
    const { t, w } = await setup();
    given({ claimedVendorName: "Pixel & Pine", invoiceNumber: "1042", amountCents: 4_800_00 }, findings(w.pixel._id, w.inv1042._id));
    const caseId = await open(t);
    await drain(t);

    let c = await getCase(t, caseId);
    expect(c?.status).toBe("AWAITING_OWNER");
    expect(c?.policyResult.needs.ownerOtp).toBe(true);
    expect(c?.replyText).toMatch(/owner's approval/);

    // A re-run without an approval changes nothing and asks nobody again.
    await t.action(internal.pipeline.advance, { caseId });
    expect((await getCase(t, caseId))?.status).toBe("AWAITING_OWNER");

    await approve(t, caseId);
    await t.action(internal.pipeline.advance, { caseId });
    c = await getCase(t, caseId);
    expect(c?.decision).toBe("PAY");
    expect(runPayer).toHaveBeenCalledTimes(1);
  });

  it("owner declines -> BLOCK", async () => {
    const { t, w } = await setup();
    given({ claimedVendorName: "Pixel & Pine", invoiceNumber: "1042" }, findings(w.pixel._id, w.inv1042._id));
    const caseId = await open(t);
    await drain(t);
    await approve(t, caseId, { cancelledAt: Date.now() });
    await t.action(internal.pipeline.advance, { caseId });
    const c = await getCase(t, caseId);
    expect(c?.status).toBe("CLOSED");
    expect(c?.decision).toBe("BLOCK");
    expect(runPayer).not.toHaveBeenCalled();
  });

  it("large payment: approved, then held through cooling-off, then paid when the timer fires", async () => {
    const { t, w } = await setup();
    const big = await t.run((ctx) =>
      ctx.db.insert("invoices", { vendorId: w.harbor._id, number: "HL-9000", amountCents: 12_000_00, dueDate: "2026-10-30", status: "open" }),
    );
    given({ claimedVendorName: "Harbor Legal", invoiceNumber: "HL-9000" }, findings(w.harbor._id, big));
    const caseId = await open(t);
    await drain(t);
    expect((await getCase(t, caseId))?.policyResult.needs.coolingOffSeconds).toBe(60);

    await approve(t, caseId, { coolingOffUntil: Date.now() + 60_000 });
    await t.action(internal.pipeline.advance, { caseId });
    let c = await getCase(t, caseId);
    expect(c?.status).toBe("AWAITING_OWNER");
    expect(c?.decision).toBe("HOLD");
    expect(runPayer).not.toHaveBeenCalled();

    await step(t, 30_000); // halfway: still held
    expect(runPayer).not.toHaveBeenCalled();

    await step(t, 31_000); // timer fires
    await drain(t);
    c = await getCase(t, caseId);
    expect(c?.decision).toBe("PAY");
    expect(runPayer).toHaveBeenCalledTimes(1);
  });

  it("two pipeline runs racing on an approved case pay exactly once", async () => {
    const { t, w } = await setup();
    given({ claimedVendorName: "Pixel & Pine", invoiceNumber: "1042" }, findings(w.pixel._id, w.inv1042._id));
    const caseId = await open(t);
    await drain(t);
    await approve(t, caseId);
    await Promise.all([
      t.action(internal.pipeline.advance, { caseId }),
      t.action(internal.pipeline.advance, { caseId }),
      t.action(internal.pipeline.advance, { caseId }),
    ]);
    await drain(t);
    expect(runPayer).toHaveBeenCalledTimes(1);
    expect((await getCase(t, caseId))?.decision).toBe("PAY");
  });

  it("payment rail fails -> HOLD, not silently dropped", async () => {
    const { t, w } = await setup();
    vi.mocked(runPayer).mockResolvedValueOnce({ ok: false, error: "sandbox down" });
    given({ claimedVendorName: "Northwind", invoiceNumber: "NW-889" }, findings(w.northwind._id, w.nw889._id));
    const caseId = await open(t);
    await drain(t);
    const c = await getCase(t, caseId);
    expect(c?.status).toBe("CLOSED");
    expect(c?.decision).toBe("HOLD");
  });

  it("vendor verifier crashes -> its lane shows failed and the case HOLDs", async () => {
    const { t } = await setup();
    vi.mocked(extractPaymentRequest).mockResolvedValue({ request: { ...REQUEST, claimedVendorName: "Northwind" }, attempts: 1 });
    vi.mocked(runVendorVerifier).mockRejectedValue(new Error("Moss timeout"));
    const caseId = await open(t);
    await drain(t);

    const c = await getCase(t, caseId);
    expect(c?.decision).toBe("HOLD");
    expect(c?.policyResult.firedRules).toContain("R14");
    const runs = await t.run((ctx) => ctx.db.query("agentRuns").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect());
    expect(runs.find((r) => r.agent === "vendorVerifier")?.status).toBe("failed");
    expect(runPayer).not.toHaveBeenCalled();
  });

  it("the Vendor Verifier lane shows the live CRS score, and a high score escalates", async () => {
    const { t, w } = await setup();
    const crs = { status: "ok" as const, businessVerified: false, raw: { product: "atdata_fraud_finder", score: 100, emailStatus: "invalid" } };
    given({ claimedVendorName: "Northwind", invoiceNumber: "NW-889" }, findings(w.northwind._id, w.nw889._id, { crs }));
    const caseId = await open(t);
    await drain(t);

    const runs = await t.run((ctx) => ctx.db.query("agentRuns").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect());
    expect(runs.find((r) => r.agent === "vendorVerifier")?.summary).toContain("CRS fraud score 100/100 · email invalid");
    expect((await getCase(t, caseId))?.policyResult.firedRules).toContain("R14");
    expect(runPayer).not.toHaveBeenCalled();
  });

  it("intake crashes -> parseFailed -> HOLD", async () => {
    const { t } = await setup();
    vi.mocked(extractPaymentRequest).mockRejectedValue(new Error("Anthropic 529"));
    const caseId = await open(t);
    await drain(t);
    const c = await getCase(t, caseId);
    expect(c?.request.parseFailed).toBe(true);
    expect(c?.decision).toBe("HOLD");
  });

  it("'hi' -> NO_ACTION, verifier never runs", async () => {
    const { t } = await setup();
    vi.mocked(extractPaymentRequest).mockResolvedValue({ request: { ...REQUEST, requestedAction: "none" }, attempts: 1 });
    const caseId = await open(t, "hi");
    await drain(t);
    const c = await getCase(t, caseId);
    expect(c?.decision).toBe("NO_ACTION");
    expect(c?.replyText).toMatch(/Countersign/);
    expect(runVendorVerifier).not.toHaveBeenCalled();
  });

  it("a duplicate webhook delivery opens one case", async () => {
    const { t, w } = await setup();
    given({ claimedVendorName: "Northwind", invoiceNumber: "NW-889" }, findings(w.northwind._id, w.nw889._id));
    const args = { channel: "call" as const, fromAddress: SCAMMER, rawContent: "x", externalId: "CA123" };
    const a = await t.mutation(internal.cases.open, args);
    const b = await t.mutation(internal.cases.open, args);
    expect(b).toEqual({ caseId: a.caseId, duplicate: true });
    await drain(t);
    expect(runPayer).toHaveBeenCalledTimes(1);
  });

  it("every event of a full run lands in an intact hash chain", async () => {
    const { t, w } = await setup();
    given({ claimedVendorName: "Northwind", invoiceNumber: "NW-889" }, findings(w.northwind._id, w.nw889._id));
    await open(t);
    await drain(t);
    const chain = await t.query(api.audit.verifyChain, {});
    expect(chain).toMatchObject({ ok: true, brokenAtSeq: null });
  });
});

describe("pipeline watchdog", () => {
  /** A case as a pipeline run leaves it when it dies after intake, before the verifier returns. */
  async function deadRun(t: T, status: "VERIFYING" | "AWAITING_OWNER" = "VERIFYING") {
    const now = Date.now();
    return t.run((ctx) =>
      ctx.db.insert("cases", {
        channel: "web",
        fromAddress: SCAMMER,
        rawContent: "Pay Northwind #NW-889",
        status,
        request: { ...REQUEST, claimedVendorName: "Northwind", invoiceNumber: "NW-889" },
        flags: [],
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  const actions = (t: T, caseId: Id<"cases">) =>
    t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((e) => e.caseId === caseId).map((e) => e.action));

  it("restarts a run that died mid-pipeline, and the restart finishes the case", async () => {
    const { t, w } = await setup();
    given({ claimedVendorName: "Northwind", invoiceNumber: "NW-889" }, findings(w.northwind._id, w.nw889._id));
    const caseId = await deadRun(t);
    vi.advanceTimersByTime(95_000);
    await t.mutation(internal.pipeline.watchdog, { caseId, restarts: 0 });
    await drain(t);

    const c = await getCase(t, caseId);
    expect(c?.decision).toBe("PAY");
    expect(runPayer).toHaveBeenCalledTimes(1);
    expect(await actions(t, caseId)).toContain("pipeline.restarted");
  });

  it("out of restarts -> closes as HOLD (R14) and never pays", async () => {
    const { t } = await setup();
    const caseId = await deadRun(t);
    vi.advanceTimersByTime(95_000);
    await t.mutation(internal.pipeline.watchdog, { caseId, restarts: 2 });
    await drain(t);

    const c = await getCase(t, caseId);
    expect(c?.status).toBe("CLOSED");
    expect(c?.decision).toBe("HOLD");
    expect(c?.policyResult.firedRules).toEqual(["R14"]);
    expect(c?.replyText).toBeTruthy();
    expect(runPayer).not.toHaveBeenCalled();
    expect(await actions(t, caseId)).toContain("pipeline.gave_up");
  });

  it("leaves a run that is still making progress alone", async () => {
    const { t } = await setup();
    const caseId = await deadRun(t);
    vi.advanceTimersByTime(10_000);
    await t.mutation(internal.pipeline.watchdog, { caseId, restarts: 0 });
    expect(await actions(t, caseId)).not.toContain("pipeline.restarted");
    expect((await getCase(t, caseId))?.status).toBe("VERIFYING");
  });

  it("never touches a case that is waiting on the owner or a callback", async () => {
    const { t } = await setup();
    const caseId = await deadRun(t, "AWAITING_OWNER");
    vi.advanceTimersByTime(10 * 60_000);
    await t.mutation(internal.pipeline.watchdog, { caseId, restarts: 2 });
    expect((await getCase(t, caseId))?.status).toBe("AWAITING_OWNER");
    expect(await actions(t, caseId)).toEqual([]);
  });

  it("a healthy run closes with its final reply in the same update", async () => {
    const { t, w } = await setup();
    given(
      { claimedVendorName: "Pixel & Pine", claimedSenderRole: "vendor", invoiceNumber: "1042", newBankDetails: NEW_BANK },
      findings(w.pixel._id, w.inv1042._id, { bankMatches: false }),
    );
    const caseId = await open(t);
    await step(t);
    await step(t);
    const [cb] = await callbacksFor(t, caseId);
    await t.mutation(internal.agents.callbackVerifier.recordOutcome, { callbackId: cb._id, outcome: "denied" });
    await drain(t);
    const closing = await t.run(async (ctx) =>
      (await ctx.db.query("auditEvents").collect()).filter(
        (e) => e.caseId === caseId && e.action === "case.updated" && (e.payload as { status?: string })?.status === "CLOSED",
      ),
    );
    expect(closing).toHaveLength(1);
    expect((closing[0].payload as { replyText?: string }).replyText).toMatch(/did not send/);
  });
});
