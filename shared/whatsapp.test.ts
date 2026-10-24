import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseWebhook, signatureValid, textMessage, toE164, verifyChallenge } from "./whatsapp";
import { SEED_VENDORS } from "./seedWorld";
import { senderMatchesVendor } from "./verification/vendorMatch";

const SECRET = "test-app-secret";
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const bytes = (body: string) => new TextEncoder().encode(body);

/** A webhook body shaped like Meta's: one entry, one change, with the given `value` fields. */
function webhook(value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "102290129340398",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550783881", phone_number_id: "106540352242922" },
              ...value,
            },
          },
        ],
      },
    ],
  };
}

const textFrom = (from: string, body: string, id = "wamid.TEXT1") => ({
  from,
  id,
  timestamp: "1749416383",
  type: "text",
  text: { body },
});

describe("verifyChallenge", () => {
  const params = (q: Record<string, string>) => new URLSearchParams(q);
  const ok = { "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "1158201444" };

  it("returns hub.challenge when the mode is subscribe and the token matches", () => {
    expect(verifyChallenge(params(ok), "verify-me")).toBe("1158201444");
  });

  it("rejects a wrong token, another mode, a missing challenge or an unset token", () => {
    expect(verifyChallenge(params({ ...ok, "hub.verify_token": "verify-mf" }), "verify-me")).toBeNull();
    expect(verifyChallenge(params({ ...ok, "hub.verify_token": "verify" }), "verify-me")).toBeNull();
    expect(verifyChallenge(params({ ...ok, "hub.mode": "unsubscribe" }), "verify-me")).toBeNull();
    expect(verifyChallenge(params({ "hub.mode": "subscribe", "hub.verify_token": "verify-me" }), "verify-me")).toBeNull();
    expect(verifyChallenge(params(ok), undefined)).toBeNull();
    expect(verifyChallenge(params({ ...ok, "hub.verify_token": "" }), "")).toBeNull();
  });
});

describe("signatureValid", () => {
  const body = JSON.stringify(webhook({ messages: [textFrom("16505551234", "Pay invoice 1042")] }));

  it("accepts Meta's sha256= HMAC of the raw body", async () => {
    expect(await signatureValid(bytes(body), sign(body), SECRET)).toBe(true);
    expect(await signatureValid(bytes(body).buffer, sign(body).toUpperCase().replace("SHA256=", "sha256="), SECRET)).toBe(true);
  });

  it("hashes the bytes as sent, so escaped unicode in the body still verifies", async () => {
    const escaped = '{"text":{"body":"Zahlung f\\u00fcr Rechnung \\ud83d\\udcb8"}}';
    expect(await signatureValid(bytes(escaped), sign(escaped), SECRET)).toBe(true);
    // Parsing and serialising again changes the bytes, which is why the handler never does that.
    const reserialised = JSON.stringify(JSON.parse(escaped));
    expect(await signatureValid(bytes(reserialised), sign(escaped), SECRET)).toBe(false);
  });

  it("rejects a changed body, the wrong secret, a bad header or an unset secret", async () => {
    expect(await signatureValid(bytes(body.replace("1042", "1043")), sign(body), SECRET)).toBe(false);
    expect(await signatureValid(bytes(body), sign(body, "another-secret"), SECRET)).toBe(false);
    expect(await signatureValid(bytes(body), sign(body).slice("sha256=".length), SECRET)).toBe(false);
    expect(await signatureValid(bytes(body), sign(body).slice(0, -2), SECRET)).toBe(false);
    expect(await signatureValid(bytes(body), null, SECRET)).toBe(false);
    expect(await signatureValid(bytes(body), sign(body, ""), undefined)).toBe(false);
    expect(await signatureValid(bytes(body), sign(body, ""), "")).toBe(false);
  });
});

describe("toE164", () => {
  it("adds the + to a WhatsApp id and keeps one that has it", () => {
    expect(toE164("16505551234")).toBe("+16505551234");
    expect(toE164("+447700900123")).toBe("+447700900123");
    expect(toE164(" 5215512345678 ")).toBe("+5215512345678");
  });

  it("returns '' for anything that isn't an international number", () => {
    for (const raw of ["", "abc", "US.13491208655302741918", "US.123456789", "0123456789", "123456", "1234567890123456", "+1 650 555 1234"]) {
      expect(toE164(raw)).toBe("");
    }
  });

  it("gives P3's sender check a number it matches against phoneOnFile", () => {
    const pixel = { id: "pixel", ...SEED_VENDORS.pixel };
    const waId = pixel.phoneOnFile.replace("+", "");
    expect(senderMatchesVendor(toE164(waId), pixel)).toBe(true);
    expect(senderMatchesVendor(toE164("15555559001"), pixel)).toBe(false);
  });
});

describe("parseWebhook", () => {
  it("reads a text message with its id, E.164 sender and body", () => {
    const payload = webhook({
      contacts: [{ profile: { name: "Sheena Nelson" }, wa_id: "16505551234" }],
      messages: [textFrom("16505551234", "  Please pay Northwind #NW-889  ")],
    });
    expect(parseWebhook(payload)).toEqual({
      texts: [{ messageId: "wamid.TEXT1", from: "+16505551234", body: "Please pay Northwind #NW-889" }],
      others: [],
    });
  });

  it("ignores status callbacks for messages we sent", () => {
    const payload = webhook({
      statuses: [{ id: "wamid.OUT1", status: "delivered", timestamp: "1750263773", recipient_id: "16505551234" }],
    });
    expect(parseWebhook(payload)).toEqual({ texts: [], others: [] });
  });

  it("lists media for a text-only reply, and skips reactions, system notices and blank texts", () => {
    const payload = webhook({
      messages: [
        { from: "16505551234", id: "wamid.IMG1", type: "image", image: { id: "1", mime_type: "image/jpeg" } },
        { from: "16505551234", id: "wamid.DOC1", type: "document", document: { id: "2", filename: "invoice.pdf" } },
        { from: "16505551234", id: "wamid.R1", type: "reaction", reaction: { message_id: "wamid.OUT1", emoji: "👍" } },
        { from: "16505551234", id: "wamid.S1", type: "system", system: { body: "changed number" } },
        textFrom("16505551234", "   ", "wamid.BLANK"),
      ],
    });
    expect(parseWebhook(payload)).toEqual({
      texts: [],
      others: [
        { messageId: "wamid.IMG1", from: "+16505551234", type: "image" },
        { messageId: "wamid.DOC1", from: "+16505551234", type: "document" },
      ],
    });
  });

  it("falls back to the business-scoped user id when Meta withholds the number", () => {
    const payload = webhook({
      contacts: [{ profile: { name: "Sheena", username: "realsheena" }, user_id: "US.13491208655302741918" }],
      messages: [{ from_user_id: "US.13491208655302741918", id: "wamid.U1", type: "text", text: { body: "Hi" } }],
    });
    expect(parseWebhook(payload).texts).toEqual([{ messageId: "wamid.U1", from: "US.13491208655302741918", body: "Hi" }]);
  });

  it("collects every message in a batched delivery, in order", () => {
    const payload = {
      entry: [
        { changes: [{ value: { messages: [textFrom("16505551234", "one", "wamid.A"), textFrom("447700900123", "two", "wamid.B")] } }] },
        { changes: [{ value: { messages: [textFrom("16505551234", "three", "wamid.C")] } }] },
      ],
    };
    expect(parseWebhook(payload).texts.map((m) => m.body)).toEqual(["one", "two", "three"]);
  });

  it("never throws on malformed payloads", () => {
    const junk = [
      null,
      "x",
      42,
      [],
      { entry: "x" },
      { entry: [null, { changes: [null, { value: null }, { value: { messages: "x" } }] }] },
      webhook({ messages: [{}, { id: "wamid.X", type: "text" }, { from: "16505551234", type: "text", text: { body: "no id" } }] }),
      webhook({ messages: [{ from: "not-a-number", id: "wamid.Y", type: "text", text: { body: "hi" } }] }),
      webhook({ messages: [textFrom("16505551234", "long id", "w".repeat(300))] }),
    ];
    for (const payload of junk) expect(parseWebhook(payload)).toEqual({ texts: [], others: [] });
  });
});

describe("textMessage", () => {
  it("sends to a phone number with `to`", () => {
    expect(textMessage("+16505551234", "Received.")).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "+16505551234",
      type: "text",
      text: { body: "Received." },
    });
  });

  it("sends to a business-scoped user id with `recipient` and no `to`", () => {
    const message = textMessage("US.13491208655302741918", "Received.");
    expect(message).toMatchObject({ recipient: "US.13491208655302741918", type: "text" });
    expect(message).not.toHaveProperty("to");
  });
});
