import { describe, expect, it } from "vitest";
import { cleanBody, htmlToText, parseForward, parseInbound, publicEmailSignals, type PostmarkInbound } from "./inbound";

const PASS = (domain: string) => [
  {
    Name: "Authentication-Results",
    Value: `inbound.postmarkapp.com; dkim=pass header.d=${domain}; spf=pass smtp.mailfrom=x@${domain}; dmarc=pass header.from=${domain}`,
  },
];

const base: PostmarkInbound = {
  From: "judge@gmail.com",
  FromName: "A Judge",
  FromFull: { Email: "Judge@Gmail.com", Name: "A Judge" },
  Subject: "Invoice 1042",
  MessageID: "abc-123",
  TextBody: "Please pay Pixel & Pine invoice 1042.\n\n> On Monday you wrote:\n> old stuff",
  Headers: PASS("gmail.com"),
};

describe("parseInbound", () => {
  it("turns a webhook payload into a case: sender, subject first, quoted history dropped, dedupe id", () => {
    const p = parseInbound(base, { ownerEmail: "priya@lumenlabs.example" });
    if ("error" in p) throw new Error(p.error);
    expect(p.fromAddress).toBe("judge@gmail.com");
    expect(p.rawContent).toBe("Subject: Invoice 1042\n\nPlease pay Pixel & Pine invoice 1042.");
    expect(p.externalId).toBe("email:abc-123");
    expect(p.signals).toMatchObject({ subject: "Invoice 1042", fromDomain: "gmail.com", forwardedBy: null });
    expect(p.signals.auth.verdict).toBe("pass");
    expect(p.pdfBase64).toBeNull();
  });

  it("refuses a payload with no sender", () => {
    expect(parseInbound({ Subject: "x" }, { ownerEmail: null })).toEqual({ error: "no sender address" });
  });

  it("uses the HTML body when there is no text part", () => {
    const p = parseInbound({ ...base, TextBody: "", HtmlBody: "<p>Pay <b>NW-889</b></p><style>x{}</style>" }, { ownerEmail: null });
    if ("error" in p) throw new Error(p.error);
    expect(p.rawContent).toContain("Pay NW-889");
  });

  it("keeps the first PDF under the size cap for Claude, and lists every attachment", () => {
    const p = parseInbound(
      {
        ...base,
        Attachments: [
          { Name: "logo.png", ContentType: "image/png", Content: "aaaa", ContentLength: 3 },
          { Name: "invoice-1042.pdf", ContentType: "application/pdf", Content: "JVBERi0=", ContentLength: 5 },
        ],
      },
      { ownerEmail: null },
    );
    if ("error" in p) throw new Error(p.error);
    expect(p.pdfBase64).toBe("JVBERi0=");
    expect(p.signals.pdf).toMatchObject({ name: "invoice-1042.pdf", bytes: 5 });
    expect(p.signals.attachments.map((a) => a.name)).toEqual(["logo.png", "invoice-1042.pdf"]);
    expect(p.rawContent).toContain("[Attached: invoice-1042.pdf]");
  });

  it("skips a PDF over 2 MB", () => {
    const p = parseInbound(
      { ...base, Attachments: [{ Name: "big.pdf", ContentType: "application/pdf", Content: "x", ContentLength: 3 * 1024 * 1024 }] },
      { ownerEmail: null },
    );
    if ("error" in p) throw new Error(p.error);
    expect(p.pdfBase64).toBeNull();
  });
});

describe("forwarded by the owner", () => {
  const forward: PostmarkInbound = {
    From: "priya@lumenlabs.example",
    FromFull: { Email: "priya@lumenlabs.example", Name: "Priya Raman" },
    Subject: "Fwd: Invoice 1042",
    MessageID: "fwd-1",
    Headers: PASS("lumenlabs.example"),
    TextBody:
      "Can you handle this?\n\n---------- Forwarded message ---------\nFrom: Pixel & Pine <billing@pixelandpine.example>\nDate: Fri, Oct 24, 2026\nSubject: Invoice 1042\nTo: Priya <priya@lumenlabs.example>\n\nHi Priya, invoice 1042 for $4,800 is attached.",
  };

  it("uses the original sender, whose authentication is unknown (a quoted From line proves nothing)", () => {
    const p = parseInbound(forward, { ownerEmail: "priya@lumenlabs.example" });
    if ("error" in p) throw new Error(p.error);
    expect(p.fromAddress).toBe("billing@pixelandpine.example");
    expect(p.signals.forwardedBy).toBe("owner");
    expect(p.signals.auth.verdict).toBe("unknown");
    expect(p.signals.forwardAuth?.verdict).toBe("pass");
    expect(p.rawContent).toBe("Subject: Invoice 1042\n\nHi Priya, invoice 1042 for $4,800 is attached.");
  });

  it("ignores the forward when the owner's own address fails authentication", () => {
    const forged = { ...forward, Headers: [{ Name: "Authentication-Results", Value: "x; dmarc=fail header.from=lumenlabs.example" }] };
    const p = parseInbound(forged, { ownerEmail: "priya@lumenlabs.example" });
    if ("error" in p) throw new Error(p.error);
    expect(p.fromAddress).toBe("priya@lumenlabs.example");
    expect(p.signals.forwardedBy).toBeNull();
    expect(p.signals.auth.verdict).toBe("fail");
  });

  it("from anyone else, a forward is just their own message", () => {
    const p = parseInbound({ ...forward, From: "judge@gmail.com", FromFull: { Email: "judge@gmail.com" }, Headers: PASS("gmail.com") }, {
      ownerEmail: "priya@lumenlabs.example",
    });
    if ("error" in p) throw new Error(p.error);
    expect(p.fromAddress).toBe("judge@gmail.com");
    expect(p.signals.forwardedBy).toBeNull();
  });
});

describe("helpers", () => {
  it("parseForward reads Apple Mail's format too", () => {
    const f = parseForward("FYI\n\nBegin forwarded message:\n\nFrom: Northwind <invoices@northwindcloud.example>\nSubject: NW-889\nReply-To: pay@elsewhere.example\n\nDue today.");
    expect(f).toMatchObject({ from: "invoices@northwindcloud.example", fromName: "Northwind", replyTo: "pay@elsewhere.example", subject: "NW-889", body: "Due today." });
    expect(parseForward("no forward here")).toBeNull();
  });

  it("cleanBody drops quoted lines and extra blank lines; htmlToText drops tags and scripts", () => {
    expect(cleanBody("a\r\n\n\n\nb\n> quoted")).toBe("a\n\nb");
    expect(htmlToText("<script>evil()</script><p>Hi&nbsp;there</p>").trim()).toBe("Hi there");
  });

  it("publicEmailSignals drops the display name and the message id", () => {
    const p = parseInbound(base, { ownerEmail: null });
    if ("error" in p) throw new Error(p.error);
    const pub = publicEmailSignals(p.signals)!;
    expect(pub).not.toHaveProperty("fromName");
    expect(pub).not.toHaveProperty("messageId");
    expect(pub.fromDomain).toBe("gmail.com");
  });
});
