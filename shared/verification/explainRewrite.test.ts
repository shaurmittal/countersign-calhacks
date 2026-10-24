import { describe, expect, it } from "vitest";
import type { RiskFlag } from "../types";
import { explainRisk } from "./explain";
import { MAX_REWRITE_CHARS, checkRewrite, rewritePrompt } from "./explainRewrite";
import { FLAG_ORDER } from "./riskFlags";

/** Every non-empty set of flags, in FLAG_ORDER. */
const FLAG_SETS: RiskFlag[][] = Array.from({ length: (1 << FLAG_ORDER.length) - 1 }, (_, i) =>
  FLAG_ORDER.filter((_, bit) => (i + 1) & (1 << bit)),
);

describe("rewritePrompt", () => {
  it("has nothing to rewrite without flags, so the fixed sentence stays", () => {
    expect(rewritePrompt([])).toBeNull();
  });

  it("gives Claude the flag names, most severe first, and the template", () => {
    expect(rewritePrompt(["urgency", "new_sender", "bank_change"])).toBe(
      "Red flags, most severe first: bank_change, new_sender, urgency\n\n" +
        "<template>\n" +
        "Red flags: new bank details, a sender not on file and pressure to pay fast. " +
        "Changed bank details are the most common sign of payment fraud, so they are confirmed with the vendor on the number already on file.\n" +
        "</template>\n\n" +
        "Rewrite the template as two plain sentences.",
    );
  });

  it("is the same for duplicate or reordered flags", () => {
    expect(rewritePrompt(["off_hours", "forbidden_rail", "off_hours"])).toBe(rewritePrompt(["forbidden_rail", "off_hours"]));
  });

  it("uses the generic lookalike sentence: the domain from the request never reaches Claude", () => {
    expect(rewritePrompt(["lookalike_domain", "urgency"])).toContain("A domain in the request imitates a known one.");
  });

  it("holds no numbers, addresses or domains and one template block, for every set of flags", () => {
    for (const flags of FLAG_SETS) {
      const prompt = rewritePrompt(flags) ?? "";
      // The off-hours reason gives the window in single digits; nothing else has a digit.
      expect(prompt.replace("between 9 PM and 7 AM", ""), flags.join()).not.toMatch(/\d/);
      expect(prompt, flags.join()).not.toMatch(/@|https?:|\.[a-z]/i);
      expect(prompt.match(/<\/?template>/g), flags.join()).toEqual(["<template>", "</template>"]);
    }
  });
});

describe("checkRewrite", () => {
  it.each([
    // owner_impersonation, new_sender, urgency
    "This message claims to come from the owner, arrives from a sender who isn't on file, and pushes for a fast payment. The real owner approves payments only with a one-time code or in ASI:One, never by text or phone.",
    // bank_change, new_sender, urgency
    "The request asks to send money to new bank details from a sender who isn’t on file, and it pushes for speed. Changed bank details are the most common sign of payment fraud, so Countersign confirms them with the vendor on the number already on file.",
    // forbidden_rail
    "The request asks for payment in gift cards. Countersign never pays vendors with gift cards, crypto or transfers to personal accounts.",
    // injection_attempt, new_sender
    "The message tries to give orders to Countersign’s assistant and comes from a sender who isn't on file. Instructions inside a message are treated as plain data and ignored.",
    // lookalike_domain, new_sender, urgency
    "The email comes from a web address that imitates a known company, from a sender who isn't on file, and it demands quick payment. Lookalike addresses are a common way to impersonate a trusted vendor.",
    // amount_anomaly
    "The amount is far outside what this vendor usually bills. An unusual amount is a common sign of a padded or fake invoice.",
    // off_hours
    "The request came in late at night, Pacific time. Requests at odd hours are a common way to rush a payment while the owner is away.",
  ])("accepts a plain rewrite: %s", (text) => {
    expect(checkRewrite(text)).toEqual({ text });
  });

  it("tidies line breaks and spaces", () => {
    expect(checkRewrite("  The request comes from a sender who isn't on file.\n\nPressure to pay quickly is a common scam tactic.  ")).toEqual({
      text: "The request comes from a sender who isn't on file. Pressure to pay quickly is a common scam tactic.",
    });
  });

  const LONG = `The request has new bank details${", new bank details".repeat(25)}. Changed bank details are a common sign of payment fraud.`;

  it.each([
    ["digits", "The request asks for about twice the usual amount, near 9800 dollars. An unusual amount is a common sign of a padded invoice.", 'plain text only: "9" (U+0039)'],
    ["a phone number", "The sender is not on file, so check with the vendor at +1 555 555 0101. A sender not on file is a common sign of fraud.", 'plain text only: "+" (U+002B)'],
    ["a link", "The message asks for payment at https://pay-northwind.example/invoice today. Lookalike pages are a common way to steal payments.", 'plain text only: "/" (U+002F)'],
    ["a bare domain", "The email comes from northwind-cloud-billing.example, which imitates a vendor. Lookalike domains are a common way to impersonate a vendor.", 'two sentences: a period inside "northwind-cloud-billing.example"'],
    ["an email address", "The sender writes from invoices@northwind instead of the address on file. Lookalike addresses are a common way to impersonate a vendor.", 'plain text only: "@" (U+0040)'],
    ["one sentence", "The request asks for new bank details from a sender who is not on file and pushes for speed.", "two sentences: found 1"],
    ["three sentences", "The request asks for new bank details. The sender is not on file. Pressure to pay fast is a common scam tactic.", "two sentences: found 3"],
    ["an abbreviation", "The request uses pressure, e.g. a deadline today. Pressure to pay quickly is a common scam tactic.", 'two sentences: a period inside "e.g."'],
    ["markdown", "**Red flags**: new bank details and a sender not on file. Changed bank details are a common sign of payment fraud.", 'plain text only: "*" (U+002A)'],
    ["quotation marks", "The sender calls this \"urgent\" and sends new bank details. Changed bank details are a common sign of payment fraud.", 'plain text only: "\\"" (U+0022)'],
    ["a question", "Did the vendor really change banks? Changed bank details are the most common sign of payment fraud.", 'plain text only: "?" (U+003F)'],
    ["an emoji", "The request has new bank details \u{1F6A9}. Changed bank details are the most common sign of payment fraud.", 'plain text only: "\u{1F6A9}" (U+1F6A9)'],
    ["too short", "Odd request. Be careful.", "length: 24 characters (40 to 400 allowed)"],
    ["too long", LONG, `length: ${LONG.length} characters (40 to 400 allowed)`],
    ["a promise to pay", "The new bank details come from a sender not on file. The invoice will be sent to the vendor once the owner agrees.", 'prediction: "will"'],
    ["a payment stated as made", "This invoice has already been paid to the new account. Changed bank details are a common sign of payment fraud.", 'outcome: "paid"'],
    ["a decision", "Countersign blocked this request because of the new bank details. Changed bank details are a common sign of payment fraud.", 'outcome: "blocked"'],
    ["decide()'s own word", "HOLD because the bank details changed and the sender is not on file. Changed bank details are a common sign of payment fraud.", 'decision word: "HOLD"'],
    ["on hold", "The payment is on hold until the vendor confirms the new bank details. Changed bank details are a common sign of payment fraud.", 'outcome: "on hold"'],
    ["an action in progress", "Countersign is calling the vendor on the number already on file. Changed bank details are a common sign of payment fraud.", 'prediction: "is calling"'],
    ["approval as the next step", "This request needs the owner's approval before anything moves. A claim to speak for the owner is a common scam tactic.", `prediction: "needs the owner's approval"`],
    ["a verdict of fraud", "This request looks like a scam from start to finish. Pressure to pay quickly is a common scam tactic.", 'verdict: "This request looks like a scam"'],
    ["a verdict of safety", "The vendor is genuine and nothing else stands out. A late request on its own is a common and harmless thing.", 'verdict: "The vendor is genuine"'],
    ["a go-ahead", "Only the timing stands out, so go ahead with the payment. Late requests on their own are common for this vendor.", 'go-ahead: "go ahead"'],
  ])("rejects %s, naming the rule and the culprit", (_, text, problem) => {
    expect(checkRewrite(text)).toEqual({ problem });
  });

  it("passes every flagged template except the off-hours reason, which gives the hours in digits", () => {
    for (const flags of FLAG_SETS) {
      const template = explainRisk({ flags, lookalikeDomains: [] });
      expect(template.length).toBeLessThanOrEqual(MAX_REWRITE_CHARS);
      const expected = flags[0] === "off_hours" ? { problem: 'plain text only: "9" (U+0039)' } : { text: template };
      expect(checkRewrite(template), template).toEqual(expected);
    }
  });
});
