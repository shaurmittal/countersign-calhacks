// @vitest-environment edge-runtime
// The WhatsApp webhook and reply against an in-memory Convex backend (convex-test). Meta is played
// by signing payloads with a test app secret; the Graph API is a mocked fetch. Nothing calls Meta.
import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";
import { internal } from "../_generated/api";

const APP_SECRET = "test-app-secret";
const SENDER = "16505551234";

const makeTest = () => convexTest(schema, modules);
type T = ReturnType<typeof makeTest>;

const graph = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
  Response.json({ messages: [{ id: "wamid.OUT" }] }),
);
const sent = () => graph.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
const sign = (body: string) => `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;

const delivery = (value: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "102290129340398", changes: [{ field: "messages", value: { messaging_product: "whatsapp", ...value } }] }],
});
const textDelivery = (id: string, body = "Pay Northwind #NW-889") =>
  delivery({ messages: [{ from: SENDER, id, timestamp: "1749416383", type: "text", text: { body } }] });

function post(t: T, payload: unknown, signature?: string | null) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {};
  if (signature !== null) headers["X-Hub-Signature-256"] = signature ?? sign(body);
  return t.fetch("/whatsapp/webhook", { method: "POST", headers, body });
}

const cases = (t: T) => t.run((ctx) => ctx.db.query("cases").collect());

beforeEach(() => {
  vi.useFakeTimers(); // the scheduled pipeline run stays queued: these tests stop at the case row
  vi.stubGlobal("fetch", graph);
  vi.stubEnv("WHATSAPP_APP_SECRET", APP_SECRET);
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verify-me");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "106540352242922");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  graph.mockClear();
});

describe("WhatsApp webhook", () => {
  it("answers Meta's handshake only with the right verify token", async () => {
    const t = makeTest();
    const ok = await t.fetch("/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1158201444");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("1158201444");
    const wrong = await t.fetch("/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=guess&hub.challenge=1158201444");
    expect(wrong.status).toBe(403);
  });

  it("rejects a POST with a missing or wrong signature and opens nothing", async () => {
    const t = makeTest();
    expect((await post(t, textDelivery("wamid.A"), null)).status).toBe(401);
    expect((await post(t, textDelivery("wamid.A"), sign("something else"))).status).toBe(401);
    expect(await cases(t)).toHaveLength(0);
  });

  it("opens one whatsapp case per message, even when Meta delivers it twice", async () => {
    const t = makeTest();
    expect((await post(t, textDelivery("wamid.A"))).status).toBe(200);
    expect((await post(t, textDelivery("wamid.A"))).status).toBe(200);
    const rows = await cases(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      channel: "whatsapp",
      fromAddress: "+16505551234",
      rawContent: "Pay Northwind #NW-889",
      externalId: "wa:wamid.A",
      status: "RECEIVED",
    });
    expect(graph).not.toHaveBeenCalled();
  });

  it("opens nothing for status callbacks, and asks for text when sent a photo", async () => {
    const t = makeTest();
    const statuses = delivery({ statuses: [{ id: "wamid.OUT", status: "read", recipient_id: SENDER }] });
    const photo = delivery({ messages: [{ from: SENDER, id: "wamid.P", type: "image", image: { id: "1" } }] });
    expect((await post(t, statuses)).status).toBe(200);
    expect((await post(t, photo)).status).toBe(200);
    expect(await cases(t)).toHaveLength(0);
    expect(sent()).toEqual([expect.objectContaining({ to: "+16505551234", text: { body: expect.stringMatching(/as text/) } })]);
  });

  it("past 10 messages a minute, opens nothing more and tells the sender to slow down", async () => {
    const t = makeTest();
    for (let i = 0; i < 11; i++) expect((await post(t, textDelivery(`wamid.${i}`))).status).toBe(200);
    expect(await cases(t)).toHaveLength(10);
    expect(sent()).toEqual([expect.objectContaining({ text: { body: expect.stringMatching(/^Slow down/) } })]);
  });

  it("still answers 200 to a signed body that isn't JSON, so Meta doesn't retry it", async () => {
    const t = makeTest();
    const res = await t.fetch("/whatsapp/webhook", { method: "POST", headers: { "X-Hub-Signature-256": sign("{oops") }, body: "{oops" });
    expect(res.status).toBe(200);
    expect(await cases(t)).toHaveLength(0);
  });
});

describe("reply.dispatch on WhatsApp", () => {
  const REPLY = "We're confirming this with the vendor on the number already on file.";
  const caseWithReply = (t: T) =>
    t.run((ctx) =>
      ctx.db.insert("cases", {
        channel: "whatsapp",
        fromAddress: "+16505551234",
        rawContent: "Pay Northwind #NW-889",
        status: "CLOSED",
        flags: [],
        replyText: REPLY,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

  it("sends replyText to the sender through the Graph API", async () => {
    const t = makeTest();
    await t.action(internal.channels.reply.dispatch, { caseId: await caseWithReply(t) });
    expect(graph).toHaveBeenCalledTimes(1);
    const [url, init] = graph.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v26.0/106540352242922/messages");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
    expect(sent()).toEqual([
      { messaging_product: "whatsapp", recipient_type: "individual", to: "+16505551234", type: "text", text: { body: REPLY } },
    ]);
  });

  it("uses WHATSAPP_GRAPH_VERSION when it is set", async () => {
    vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v25.0");
    const t = makeTest();
    await t.action(internal.channels.reply.dispatch, { caseId: await caseWithReply(t) });
    expect(graph.mock.calls[0][0]).toBe("https://graph.facebook.com/v25.0/106540352242922/messages");
  });

  it("logs a failed send without the token, and doesn't throw", async () => {
    graph.mockResolvedValueOnce(Response.json({ error: { code: 190, message: "Error validating access token" } }, { status: 401 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = makeTest();
    await t.action(internal.channels.reply.dispatch, { caseId: await caseWithReply(t) });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("HTTP 401 code=190"));
    expect(warn.mock.calls.flat().join(" ")).not.toContain("test-token");
  });

  it("without the Meta settings, logs the reply instead of sending it", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const t = makeTest();
    await t.action(internal.channels.reply.dispatch, { caseId: await caseWithReply(t) });
    expect(graph).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("not configured"));
  });
});
