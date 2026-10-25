import { beforeAll, describe, expect, it } from "vitest";
import {
  RELEASE_TTL_MS,
  canonicalPayload,
  generateCountersignKeys,
  parsePayload,
  signPayload,
  verifyPayload,
  type ReleasePayload,
} from "./payload";
import { evaluateTransfer, type TransferContext } from "./verify";

const NOW = 1_800_000_000_000;
const PAYLOAD: ReleasePayload = {
  v: 1,
  caseId: "case1",
  paymentId: "pay1",
  vendorId: "vendor1",
  routing: "026009593",
  last4: "2290",
  amountCents: 362_00,
  invoiceNumber: "NW-889",
  decision: "PAY",
  firedRules: ["R12"],
  issuedAt: NOW,
  expiresAt: NOW + RELEASE_TTL_MS,
  nonce: "n-1",
};

let keys: { privateJwk: JsonWebKey; publicJwk: JsonWebKey };
let otherKeys: { privateJwk: JsonWebKey; publicJwk: JsonWebKey };
let signature: string;

beforeAll(async () => {
  keys = await generateCountersignKeys();
  otherKeys = await generateCountersignKeys();
  signature = await signPayload(PAYLOAD, keys.privateJwk);
});

const ctx = (o: Partial<TransferContext> = {}): TransferContext => ({
  verifyKey: keys.publicJwk,
  now: NOW + 1_000,
  nonceUsed: false,
  payee: { routing: "026009593", accountLast4: "2290", status: "active" },
  balanceCents: 250_000_00,
  ...o,
});

describe("countersignature", () => {
  it("canonical JSON doesn't depend on key order", () => {
    const shuffled = Object.fromEntries(Object.entries(PAYLOAD).reverse());
    expect(canonicalPayload(shuffled)).toBe(canonicalPayload(PAYLOAD));
  });

  it("verifies its own signature, also with keys in another order", async () => {
    expect(await verifyPayload(Object.fromEntries(Object.entries(PAYLOAD).reverse()), signature, keys.publicJwk)).toBe(true);
  });

  it("any change to the payload breaks it", async () => {
    for (const change of [{ amountCents: 36_200_00 }, { last4: "9921" }, { routing: "021000021" }, { nonce: "n-2" }, { expiresAt: NOW + 10 * RELEASE_TTL_MS }]) {
      expect(await verifyPayload({ ...PAYLOAD, ...change }, signature, keys.publicJwk), JSON.stringify(change)).toBe(false);
    }
  });

  it("a signature from another key doesn't verify", async () => {
    expect(await verifyPayload(PAYLOAD, await signPayload(PAYLOAD, otherKeys.privateJwk), keys.publicJwk)).toBe(false);
  });

  it("garbage signatures are rejected without throwing", async () => {
    for (const bad of ["", "abc", "not base64!!", "A".repeat(86)]) expect(await verifyPayload(PAYLOAD, bad, keys.publicJwk)).toBe(false);
  });

  it("parsePayload refuses unknown keys, wrong types and bad amounts", () => {
    expect(parsePayload(PAYLOAD)).not.toBeNull();
    expect(parsePayload({ ...PAYLOAD, extra: 1 })).toBeNull();
    expect(parsePayload({ ...PAYLOAD, amountCents: "362" })).toBeNull();
    expect(parsePayload({ ...PAYLOAD, amountCents: 0 })).toBeNull();
    expect(parsePayload({ ...PAYLOAD, v: 2 })).toBeNull();
    expect(parsePayload(null)).toBeNull();
  });
});

describe("Lumen Bank checks, in order", () => {
  it("accepts a fresh countersigned PAY to the payee on file", async () => {
    const v = await evaluateTransfer(PAYLOAD, signature, ctx());
    expect(v.ok).toBe(true);
  });

  it("1. no signature -> 'No countersignature'", async () => {
    const v = await evaluateTransfer(PAYLOAD, undefined, ctx());
    expect(v).toMatchObject({ ok: false, code: "no_signature", reason: "No countersignature", consumeNonce: false });
  });

  it("malformed instruction -> rejected before any crypto", async () => {
    expect(await evaluateTransfer({ hello: "bank" }, signature, ctx())).toMatchObject({ ok: false, code: "malformed" });
  });

  it("no verify key configured -> fail closed", async () => {
    expect(await evaluateTransfer(PAYLOAD, signature, ctx({ verifyKey: null }))).toMatchObject({ ok: false, code: "no_verify_key" });
  });

  it("2. signature from another key -> 'Countersignature invalid'", async () => {
    const forged = await signPayload(PAYLOAD, otherKeys.privateJwk);
    expect(await evaluateTransfer(PAYLOAD, forged, ctx())).toMatchObject({ ok: false, code: "bad_signature", reason: "Countersignature invalid" });
  });

  it("3. real signature, amount changed -> 'Countersignature invalid'", async () => {
    expect(await evaluateTransfer({ ...PAYLOAD, amountCents: 48_000_00 }, signature, ctx())).toMatchObject({ ok: false, code: "bad_signature" });
  });

  it("decision other than PAY -> rejected even when signed", async () => {
    const hold = { ...PAYLOAD, decision: "HOLD" };
    const v = await evaluateTransfer(hold, await signPayload(hold, keys.privateJwk), ctx());
    expect(v).toMatchObject({ ok: false, code: "not_pay" });
  });

  it("4. exact replay -> 'Countersignature already used', even long after it expired", async () => {
    expect(await evaluateTransfer(PAYLOAD, signature, ctx({ nonceUsed: true }))).toMatchObject({ ok: false, code: "replayed", reason: "Countersignature already used" });
    expect(await evaluateTransfer(PAYLOAD, signature, ctx({ nonceUsed: true, now: NOW + 3_600_000 }))).toMatchObject({ code: "replayed" });
  });

  it("expired -> rejected, and the nonce is consumed", async () => {
    expect(await evaluateTransfer(PAYLOAD, signature, ctx({ now: NOW + RELEASE_TTL_MS + 1 }))).toMatchObject({ ok: false, code: "expired", consumeNonce: true });
  });

  it("payee not on the bank's own file -> rejected", async () => {
    expect(await evaluateTransfer(PAYLOAD, signature, ctx({ payee: null }))).toMatchObject({ ok: false, code: "unknown_payee" });
  });

  it("payee on file but different account -> rejected", async () => {
    const payee = { routing: "026009593", accountLast4: "9921", status: "active" as const };
    expect(await evaluateTransfer(PAYLOAD, signature, ctx({ payee }))).toMatchObject({ ok: false, code: "payee_mismatch" });
  });

  it("frozen payee -> rejected", async () => {
    const payee = { routing: "026009593", accountLast4: "2290", status: "frozen" as const };
    expect(await evaluateTransfer(PAYLOAD, signature, ctx({ payee }))).toMatchObject({ ok: false, code: "payee_frozen" });
  });

  it("no account / insufficient funds -> rejected", async () => {
    expect(await evaluateTransfer(PAYLOAD, signature, ctx({ balanceCents: null }))).toMatchObject({ code: "no_account" });
    expect(await evaluateTransfer(PAYLOAD, signature, ctx({ balanceCents: 100 }))).toMatchObject({ code: "insufficient_funds" });
  });
});
