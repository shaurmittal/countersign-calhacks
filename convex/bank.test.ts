// @vitest-environment edge-runtime
// Lumen Bank against an in-memory Convex backend: the real pipeline paying through the bank with a real
// countersignature, the bank refusing what it should, and the public door a hijacked agent would use.
import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { PaymentRequest, VendorFindings } from "../shared/types";
import { templateReply } from "../shared/reply";
import { generateCountersignKeys, signPayload } from "../shared/bank/payload";
import { extractPaymentRequest } from "./lib/claude";
import { runVendorVerifier } from "./agents/vendorVerifier";
import { OPENING_BALANCE_CENTS } from "./bank";

vi.mock("./lib/claude", () => ({
  extractPaymentRequest: vi.fn(),
  composeReply: vi.fn(async ({ result, ctx }) => ({ text: templateReply(result, ctx), source: "template" })),
}));
vi.mock("./agents/vendorVerifier", () => ({ runVendorVerifier: vi.fn() }));
vi.mock("./agents/riskAnalyst", () => ({
  runRiskAnalyst: vi.fn(async () => ({ riskScore: 0, flags: [], explanation: "" })),
}));

const REQUEST: PaymentRequest = {
  claimedVendorName: "Northwind",
  claimedSenderRole: "unknown",
  amountCents: null,
  currency: "USD",
  invoiceNumber: "NW-889",
  newBankDetails: null,
  urgencyClaims: [],
  requestedAction: "pay_invoice",
  injectionAttempt: false,
};

let keys: { privateJwk: JsonWebKey; publicJwk: JsonWebKey };
beforeAll(async () => {
  keys = await generateCountersignKeys();
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubEnv("COUNTERSIGN_SIGNING_KEY", JSON.stringify(keys.privateJwk));
  vi.stubEnv("LUMEN_BANK_VERIFY_KEY", JSON.stringify(keys.publicJwk));
  vi.stubEnv("PAYMENT_RAIL", "");
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
  const w = await t.run(async (ctx) => {
    const vendors = await ctx.db.query("vendors").collect();
    const invoices = await ctx.db.query("invoices").collect();
    return {
      northwind: vendors.find((v) => v.name === "Northwind Cloud")!,
      pixel: vendors.find((v) => v.name === "Pixel & Pine Design")!,
      nw889: invoices.find((i) => i.number === "NW-889")!,
    };
  });
  return { t, w };
}

const drain = (t: T) => t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(5_000), 1_000);
const balance = (t: T) => t.run(async (ctx) => (await ctx.db.query("bankAccounts").first())!.balanceCents);
const transfers = (t: T) => t.run((ctx) => ctx.db.query("bankTransfers").collect());

function findings(vendorId: string, invoiceId: string): VendorFindings {
  return {
    vendorId,
    matchConfidence: 0.95,
    senderOnFile: false,
    bankMatches: null,
    crs: { status: "not_checked" },
    ofacHit: false,
    matchingInvoiceId: invoiceId,
    alreadyPaidAt: null,
  };
}

/** "Pay Northwind #NW-889" through the real pipeline and the real Payer. */
async function payNorthwind(t: T, w: Awaited<ReturnType<typeof setup>>["w"]) {
  vi.mocked(extractPaymentRequest).mockResolvedValue({ request: REQUEST, attempts: 1 });
  vi.mocked(runVendorVerifier).mockResolvedValue(findings(w.northwind._id, w.nw889._id));
  const { caseId } = await t.mutation(internal.cases.open, { channel: "web", fromAddress: "web:test-sender-1", rawContent: "Pay Northwind #NW-889." });
  await drain(t);
  return caseId as Id<"cases">;
}

async function post(t: T, body: unknown) {
  const res = await t.fetch("/bank/transfers", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as { status: string; reason?: string; code?: string }, headers: res.headers };
}

describe("Lumen Bank", () => {
  it("seed creates the account and one payee per vendor; ensureSeeded never resets", async () => {
    const { t } = await setup();
    expect(await balance(t)).toBe(OPENING_BALANCE_CENTS);
    const payees = await t.run((ctx) => ctx.db.query("bankPayees").collect());
    expect(payees).toHaveLength(4);
    await t.run((ctx) => ctx.db.query("bankAccounts").first().then((a) => ctx.db.patch(a!._id, { balanceCents: 123 })));
    expect(await t.mutation(internal.bank.ensureSeeded, {})).toEqual({ accountCreated: false, payeesCreated: 0 });
    expect(await balance(t)).toBe(123);
  });

  it("a PAY goes through the bank as a countersigned transfer; the balance drops", async () => {
    const { t, w } = await setup();
    const caseId = await payNorthwind(t, w);

    const c = await t.run((ctx) => ctx.db.get(caseId));
    expect(c?.decision).toBe("PAY");
    expect(await balance(t)).toBe(OPENING_BALANCE_CENTS - 362_00);

    const [tr] = await transfers(t);
    expect(tr).toMatchObject({ status: "accepted", source: "countersign", amountCents: 362_00, payeeName: "Northwind Cloud", caseId });
    expect(tr.signatureHash).toMatch(/^[0-9a-f]{64}$/);

    const payment = await t.run((ctx) => ctx.db.query("payments").first());
    expect(payment).toMatchObject({ rail: "lumen_bank", status: "sent", externalId: `lumen_${tr._id}` });

    const runs = await t.run((ctx) => ctx.db.query("agentRuns").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect());
    expect(runs.find((r) => r.agent === "payer")?.summary).toMatch(/^Paid via Lumen Bank · countersigned · sig [0-9a-f]{4}…$/);

    const audit = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((e) => e.caseId === caseId).map((e) => e.action));
    expect(audit).toContain("bank.transfer.accepted");
    expect(await t.query(api.audit.verifyChain, {})).toMatchObject({ ok: true });
  });

  it("no signing key -> nothing moves, the case HOLDs (fail closed)", async () => {
    const { t, w } = await setup();
    vi.stubEnv("COUNTERSIGN_SIGNING_KEY", "");
    const caseId = await payNorthwind(t, w);
    expect((await t.run((ctx) => ctx.db.get(caseId)))?.decision).toBe("HOLD");
    expect(await balance(t)).toBe(OPENING_BALANCE_CENTS);
    expect(await transfers(t)).toHaveLength(0);
  });

  it("signed with a key the bank doesn't trust -> the bank refuses, the case HOLDs", async () => {
    const { t, w } = await setup();
    vi.stubEnv("LUMEN_BANK_VERIFY_KEY", JSON.stringify((await generateCountersignKeys()).publicJwk));
    const caseId = await payNorthwind(t, w);
    expect((await t.run((ctx) => ctx.db.get(caseId)))?.decision).toBe("HOLD");
    expect(await balance(t)).toBe(OPENING_BALANCE_CENTS);
    expect((await transfers(t))[0]).toMatchObject({ status: "rejected", rejectReason: "Countersignature invalid" });
  });

  it("frozen payee -> the bank refuses even a genuine countersignature", async () => {
    const { t, w } = await setup();
    await t.run(async (ctx) => {
      const payee = await ctx.db.query("bankPayees").withIndex("by_vendor", (q) => q.eq("vendorId", w.northwind._id)).first();
      await ctx.db.patch(payee!._id, { status: "frozen" });
    });
    const caseId = await payNorthwind(t, w);
    expect((await t.run((ctx) => ctx.db.get(caseId)))?.decision).toBe("HOLD");
    expect((await transfers(t))[0]).toMatchObject({ status: "rejected", rejectCode: "payee_frozen" });
    expect(await balance(t)).toBe(OPENING_BALANCE_CENTS);
  });

  it("an owner-approved bank change updates the bank's own payee record", async () => {
    const { t, w } = await setup();
    const caseId = await t.run((ctx) =>
      ctx.db.insert("cases", {
        channel: "web",
        fromAddress: "web:x",
        rawContent: "x",
        status: "VERIFYING",
        vendorId: w.pixel._id,
        request: { ...REQUEST, newBankDetails: { routing: "021000021", account: "55519921" } },
        policyResult: { decision: "PAY", firedRules: ["R2", "R6", "R12"], reasons: [], needs: { callback: false, ownerOtp: false, coolingOffSeconds: 0 }, overridable: true },
        flags: [],
        createdAt: 0,
        updatedAt: 0,
      }),
    );
    await t.mutation(internal.cases.applyConfirmedBankChange, { caseId });
    const payee = await t.run((ctx) => ctx.db.query("bankPayees").withIndex("by_vendor", (q) => q.eq("vendorId", w.pixel._id)).first());
    expect(payee).toMatchObject({ routing: "021000021", accountLast4: "9921", status: "active" });
  });
});

describe("POST /bank/transfers: the hijacked agent's door", () => {
  it("rejects all four attempts with the right reasons, and moves nothing", async () => {
    const { t, w } = await setup();
    await payNorthwind(t, w);
    const sample = await t.query(api.bank.replaySample, {});
    expect(sample).not.toBeNull();
    const before = await balance(t);

    const noSig = await post(t, { payload: sample!.payload });
    expect(noSig.json).toMatchObject({ status: "rejected", reason: "No countersignature" });

    const forgedKey = (await generateCountersignKeys()).privateJwk;
    const forged = await post(t, { payload: sample!.payload, signature: await signPayload(sample!.payload, forgedKey) });
    expect(forged.json).toMatchObject({ status: "rejected", reason: "Countersignature invalid" });

    const tampered = await post(t, { payload: { ...(sample!.payload as object), amountCents: 48_000_00 }, signature: sample!.signature });
    expect(tampered.json).toMatchObject({ status: "rejected", reason: "Countersignature invalid" });

    const replay = await post(t, { payload: sample!.payload, signature: sample!.signature });
    expect(replay.json).toMatchObject({ status: "rejected", reason: "Countersignature already used" });

    expect(await balance(t)).toBe(before);
    const rejected = (await transfers(t)).filter((x) => x.source === "unsigned_api");
    expect(rejected.map((x) => x.status)).toEqual(["rejected", "rejected", "rejected", "rejected"]);
  });

  it("answers CORS preflight and sends CORS headers", async () => {
    const { t } = await setup();
    const pre = await t.fetch("/bank/transfers", { method: "OPTIONS" });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("*");
    expect((await post(t, { payload: null })).headers.get("access-control-allow-origin")).toBe("*");
  });

  it("rejects a body that isn't JSON without recording anything", async () => {
    const { t } = await setup();
    const res = await post(t, "not json");
    expect(res.status).toBe(400);
    expect(await transfers(t)).toHaveLength(0);
  });

  it("rate-limits the public door at 30 attempts a minute", async () => {
    const { t } = await setup();
    for (let i = 0; i < 30; i++) expect((await post(t, { payload: null })).status).toBe(200);
    const limited = await post(t, { payload: null });
    expect(limited.status).toBe(429);
    expect(await transfers(t)).toHaveLength(30);
    vi.advanceTimersByTime(61_000);
    expect((await post(t, { payload: null })).status).toBe(200);
  });
});
