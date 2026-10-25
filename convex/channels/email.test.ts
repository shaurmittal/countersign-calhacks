// @vitest-environment edge-runtime
// The email channel against an in-memory Convex backend (convex-test): the Postmark webhook, its secret,
// dedupe, PDF storage, what public queries show, and /try's simulated attacks.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";
import { api, internal } from "../_generated/api";
import { safeEqual, webhookAuthorized } from "./email";
import type { EmailSignals, PostmarkInbound } from "../../shared/email/inbound";
import { EMAIL_ATTACKS } from "../../shared/email/attacks";

const SECRET = "test-secret-123";
const SENDER = "judge-session-0001";
const makeTest = () => convexTest(schema, modules);
const basic = (password: string) => `Basic ${btoa(`countersign:${password}`)}`;

const payload: PostmarkInbound = {
  From: "judge@gmail.com",
  FromFull: { Email: "judge@gmail.com", Name: "A Judge" },
  Subject: "Invoice NW-889",
  MessageID: "msg-1",
  TextBody: "Please pay Northwind invoice NW-889.",
  Headers: [
    {
      Name: "Authentication-Results",
      Value: "inbound.postmarkapp.com; dkim=pass header.d=gmail.com; spf=pass smtp.mailfrom=judge@gmail.com; dmarc=pass header.from=gmail.com",
    },
  ],
  Attachments: [{ Name: "invoice.pdf", ContentType: "application/pdf", Content: btoa("%PDF-1.4 test"), ContentLength: 13 }],
};

function post(t: ReturnType<typeof makeTest>, body: unknown, auth = basic(SECRET)) {
  return t.fetch("/email/inbound", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.useFakeTimers(); // the scheduled pipeline run stays queued
  vi.stubEnv("EMAIL_WEBHOOK_SECRET", SECRET);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /email/inbound", () => {
  it("opens an email case with the sender, the subject, the authentication result and the stored PDF", async () => {
    const t = makeTest();
    const res = await post(t, payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: false });

    const [c] = await t.run((ctx) => ctx.db.query("cases").collect());
    expect(c).toMatchObject({ channel: "email", fromAddress: "judge@gmail.com", externalId: "email:msg-1", status: "RECEIVED" });
    expect(c.rawContent).toBe("Subject: Invoice NW-889\n\nPlease pay Northwind invoice NW-889.\n\n[Attached: invoice.pdf]");
    const signals = c.emailSignals as EmailSignals;
    expect(signals.auth.verdict).toBe("pass");
    expect(signals.pdf?.storageId).toBeTruthy();
    const stored = await t.run(async (ctx) => (await ctx.storage.get(signals.pdf!.storageId as never))?.text());
    expect(stored).toBe("%PDF-1.4 test");
  });

  it("dedupes Postmark's retries on the message id", async () => {
    const t = makeTest();
    await post(t, payload);
    expect(await (await post(t, payload)).json()).toEqual({ ok: true, duplicate: true });
    expect(await t.run((ctx) => ctx.db.query("cases").collect())).toHaveLength(1);
  });

  it("rejects a wrong or missing secret with 401 and opens nothing", async () => {
    const t = makeTest();
    expect((await post(t, payload, basic("wrong"))).status).toBe(401);
    expect((await post(t, payload, "")).status).toBe(401);
    expect(await t.run((ctx) => ctx.db.query("cases").collect())).toHaveLength(0);
  });

  it("is switched off (503) until the secret is set", async () => {
    vi.stubEnv("EMAIL_WEBHOOK_SECRET", "");
    expect((await post(makeTest(), payload)).status).toBe(503);
  });

  it("answers 200 without a case for a payload it can't use, so Postmark doesn't retry it", async () => {
    const t = makeTest();
    const res = await post(t, { Subject: "no sender" });
    expect(await res.json()).toEqual({ ok: false, reason: "no sender address" });
    expect(await t.run((ctx) => ctx.db.query("cases").collect())).toHaveLength(0);
  });

  it("public queries show the sender's domain only, never the name, the address or the message id", async () => {
    const t = makeTest();
    await post(t, payload);
    const [c] = await t.query(api.cases.recent, {});
    expect(c.fromAddress).toBe("…@gmail.com");
    expect(c.emailSignals).not.toHaveProperty("fromName");
    expect(c.emailSignals).not.toHaveProperty("messageId");
    expect(c.emailSignals?.pdf).toEqual({ name: "invoice.pdf", bytes: 13 });
  });
});

describe("webhook secret check", () => {
  it("compares in constant time and needs Basic credentials", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(webhookAuthorized(basic(SECRET), SECRET)).toBe(true);
    expect(webhookAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(false);
    expect(webhookAuthorized(basic(SECRET), undefined)).toBe(false);
    expect(webhookAuthorized("Basic !!!not-base64", SECRET)).toBe(false);
  });
});

describe("simulated attacks on /try", () => {
  it("runs a crafted email through the same parser and lists it for that visitor only", async () => {
    const t = makeTest();
    const caseId = await t.action(api.channels.email.simulateAttack, { attack: "forged-vendor", senderId: SENDER });
    const c = await t.run((ctx) => ctx.db.get(caseId));
    expect(c).toMatchObject({ channel: "email", fromAddress: "invoices@northwindcloud.example" });
    expect(c?.externalId).toMatch(/^sim-email:/);
    expect((c?.emailSignals as EmailSignals).simulated).toBe(true);
    expect((c?.emailSignals as EmailSignals).auth).toMatchObject({ dmarc: "fail", verdict: "fail" });

    const mine = await t.query(api.channels.email.mySimulations, { senderId: SENDER });
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ attack: "forged-vendor", status: "RECEIVED", decision: null });
    expect(await t.query(api.channels.email.mySimulations, { senderId: "someone-else-0002" })).toEqual([]);
  });

  it("every attack parses, and the PDF one stores its invoice", async () => {
    const t = makeTest();
    for (const a of EMAIL_ATTACKS) await t.action(api.channels.email.simulateAttack, { attack: a.id, senderId: SENDER });
    const cases = await t.run((ctx) => ctx.db.query("cases").collect());
    expect(cases).toHaveLength(EMAIL_ATTACKS.length);
    const pdf = cases.find((c) => (c.emailSignals as EmailSignals).pdf);
    expect((pdf?.emailSignals as EmailSignals).pdf?.storageId).toBeTruthy();
  });

  it("refuses unknown attacks and bad sessions, and rate-limits each visitor", async () => {
    const t = makeTest();
    await expect(t.action(api.channels.email.simulateAttack, { attack: "nope", senderId: SENDER })).rejects.toThrow(/Unknown attack/);
    await expect(t.action(api.channels.email.simulateAttack, { attack: "forged-vendor", senderId: "x" })).rejects.toThrow(/Invalid session/);
    for (let i = 0; i < 5; i++) await t.action(api.channels.email.simulateAttack, { attack: "forged-ceo", senderId: SENDER });
    await expect(t.action(api.channels.email.simulateAttack, { attack: "forged-ceo", senderId: SENDER })).rejects.toThrow(/Slow down/);
  });
});

describe("after the event", () => {
  it("the privacy purge cuts email senders down to their domain", async () => {
    const t = makeTest();
    await post(t, payload);
    await t.mutation(internal.privacy.purgeCallerNumbers, {});
    const [c] = await t.run((ctx) => ctx.db.query("cases").collect());
    expect(c.fromAddress).toBe("…@gmail.com");
  });
});
