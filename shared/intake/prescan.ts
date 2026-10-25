// Deterministic signals pulled from the raw message before (and regardless of) the model.
// Defense in depth: a prompt injection can talk the model out of reporting itself, but not
// these regexes. The parser ORs these into the model's output; they can only add caution.

export type Prescan = {
  injection: boolean;
  forbiddenRail: "gift_cards" | "crypto" | null;
  routing: string | null;
  account: string | null;
  urgency: string[];
  amountsCents: number[];
  greetingOnly: boolean;
  /** Something sensitive the message asks the business to hand over (R18), or null. */
  sensitive: string | null;
};

const INJECTION = [
  /\bignore\b.{0,40}\b(instructions?|rules?|prompts?|polic(y|ies))\b/i,
  /\bdisregard\b.{0,40}\b(instructions?|rules?|above|previous)\b/i,
  /\b(system|developer)\s*(prompt|message|override|mode)\b/i,
  /^\s*(system|assistant)\s*:/im,
  /\byou are (now|no longer)\b/i,
  /\b(new|updated) instructions?\b/i,
  /\b(approve|authori[sz]e|mark)\b.{0,30}\b(automatically|without (verification|checking|a callback)|as (approved|verified))\b/i,
  /\b(skip|bypass|disable)\b.{0,30}\b(verification|callback|checks?|policy|otp)\b/i,
  /<\/?\s*(untrusted_message|system|instructions?)\s*>/i,
];

const GIFT_CARDS = /\b(gift\s*cards?|itunes|apple\s*cards?|google\s*play|steam\s*cards?|amazon\s*cards?|prepaid\s*cards?)\b/i;
const CRYPTO = /\b(bitcoin|btc|crypto(currency)?|usdt|usdc|tether|ethereum|eth|wallet\s*address)\b/i;

// Asks for things a business never sends to a requester: an asking verb shortly before the thing asked for.
const ASK = String.raw`\b(send|share|give|provide|forward|reply with|text|email|tell|confirm|read (?:me )?out|what(?:'s| is))\b.{0,60}?`;
const SENSITIVE: [RegExp, string][] = [
  [new RegExp(`${ASK}\\b(passwords?|passcodes?|log-?in (?:details|info|credentials)|credentials|sign-?in details)\\b`, "i"), "login credentials"],
  [new RegExp(`${ASK}\\b(2fa|mfa|one[- ]time (?:pass)?codes?|verification codes?|security codes?|otp|authenticator codes?|auth codes?)\\b`, "i"), "a verification code"],
  [new RegExp(`${ASK}\\b(ssns?|social security(?: numbers?)?)\\b`, "i"), "social security numbers"],
  [new RegExp(`${ASK}\\b(w-?2s?|w2 forms?|tax forms?|tax returns?)\\b`, "i"), "tax forms"],
  [new RegExp(`${ASK}\\b(employee|payroll|staff) (?:list|records|data|details|information)\\b`, "i"), "employee data"],
  [new RegExp(`${ASK}\\b(card numbers?|card pins?|pins?|cvv|cvc|full (?:bank )?account numbers?|bank log-?in)\\b`, "i"), "card or bank login details"],
];
// "Verify your account at https://..." : a link plus a log-in or verify ask is a credential-phishing attempt.
const LINK = /\b(?:https?:\/\/|www\.)\S+/i;
const LINK_ASK = /\b(log ?in|sign ?in|verify|confirm your|reset your|unlock|re-?activate|update your (?:payment|billing|account))\b/i;

const URGENCY = [
  /\btoday\b/i,
  /\bright now\b/i,
  /\b(asap|urgent(ly)?|immediately|right away)\b/i,
  /\bbefore (my|the) (flight|meeting|deadline)\b/i,
  /\bwithin (the|an|\d+) (hour|hours|minutes?)\b/i,
  /\b(shut\s*down|cut\s*off|suspend(ed)?|terminat(ed|ion)|final notice|past due|penalt(y|ies))\b/i,
];

export function prescan(text: string): Prescan {
  const urgency = URGENCY.flatMap((re) => {
    const m = text.match(re);
    return m ? [m[0].toLowerCase()] : [];
  });

  // 9-digit ABA routing numbers near "routing"/"ABA"; account numbers near "account"/"acct".
  const routing = text.match(/\b(?:routing|aba|rtn)\b[^0-9]{0,20}(\d{9})\b/i)?.[1] ?? null;
  const account = text.match(/\b(?:account|acct|acc)\b(?:\s*(?:number|no\.?|#))?[^0-9]{0,20}(\d{4,17})\b/i)?.[1] ?? null;

  const amountsCents = [...text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?\s*(k\b)?/gi)].map((m) => {
    const dollars = Number(m[1].replace(/,/g, "")) * (m[3] ? 1000 : 1);
    return dollars * 100 + Number(m[2] ?? 0);
  });

  const greetingOnly = /^\s*(hi|hey|hello|yo|sup|what('?s| is) (this|countersign)\??|who (is|are) (this|you)\??|help|\?)[\s!.?,]*(what('?s| is) (this|countersign))?[\s!.?]*$/i.test(text);

  return {
    injection: INJECTION.some((re) => re.test(text)),
    forbiddenRail: GIFT_CARDS.test(text) ? "gift_cards" : CRYPTO.test(text) ? "crypto" : null,
    routing,
    account,
    urgency: [...new Set(urgency)],
    amountsCents,
    greetingOnly,
    sensitive: SENSITIVE.find(([re]) => re.test(text))?.[1] ?? (LINK.test(text) && LINK_ASK.test(text) ? "a log-in through a link" : null),
  };
}
