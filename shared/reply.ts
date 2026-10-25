// Requester-facing replies. Claude writes them (convex/lib/claude.ts); these templates are the
// fallback, and isSafeReply() rejects any model reply that over-promises or leaks numbers.
import type { MessageType, PolicyResult } from "./types";

export type ReplyContext = {
  company: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  paymentSent: boolean;
  callbackInProgress: boolean;
  /** How the Intake Parser triaged the message; shapes the reply when nothing is paid. */
  messageType?: MessageType;
};

/** Replies to messages that ask for no money, by what they are. */
function triageReply(type: MessageType | undefined, company: string): string {
  switch (type) {
    case "meeting":
      return `Thanks for reaching out. I've passed your request to the owner of ${company}, who will reply to you directly.`;
    case "question":
    case "vendor_update":
    case "invoice_dispute":
    case "other":
      return `Thanks for your message. I've passed it to the owner of ${company}, who will get back to you directly.`;
    case "sales_or_spam":
      return `Thanks, but ${company} isn't looking for this right now.`;
    default:
      return `Hi! This is Countersign, the payments assistant for ${company}. Every payment request sent here is verified before any money moves.`;
  }
}

export function templateReply(result: PolicyResult, ctx: ReplyContext): string {
  const vendor = ctx.vendorName ?? "the vendor";
  const fired = new Set(result.firedRules);
  const reasons = result.reasons.join(" ");

  switch (result.decision) {
    case "NO_ACTION":
      return triageReply(ctx.messageType, ctx.company);
    case "PAY":
      return ctx.paymentSent
        ? `Thanks. ${ctx.invoiceNumber ? `Invoice ${ctx.invoiceNumber}` : "The invoice"} from ${vendor} has been paid to the account on file.`
        : "We've received your request and are verifying it before any payment is made.";
    case "BLOCK": {
      if (fired.has("R18")) {
        return "We never share passwords, codes, tax or personal data, and we don't log in through links we're sent. The business owner has been notified.";
      }
      let why = "";
      if (fired.has("R9")) why = " Countersign never pays with gift cards, crypto or wires to personal accounts.";
      else if (fired.has("R8")) why = " The payee failed a sanctions check.";
      else if (fired.has("R10")) why = ` ${vendor} told us directly that they did not send this request.`;
      else if (fired.has("R13")) why = " This invoice has already been paid.";
      else if (/owner declined/i.test(reasons)) why = " The business owner declined it.";
      else if (fired.has("R1")) why = " This payee is not on file.";
      return `We can't make this payment.${why} The business owner has been notified.`;
    }
    case "ESCALATE":
      return "This payment needs the business owner's approval on their registered device. Nothing will be paid until they approve.";
    case "HOLD":
      if (ctx.callbackInProgress || result.needs.callback) {
        return `I can't make that payment until I've confirmed it with ${vendor} directly. I'm calling them now on the number we have on file.`;
      }
      if (/cooling-off/i.test(reasons)) return "The owner has approved this payment. It will be released after a short cooling-off period.";
      if (/several payments/i.test(reasons)) return "Please send one payment request per message so each can be verified separately.";
      if (/could not be read/i.test(reasons)) {
        return "Sorry, we couldn't read that request. Please send the vendor, invoice number and amount as plain text.";
      }
      if (/needs the new account details/i.test(reasons)) {
        return `To change where ${vendor} is paid, please send the new routing and account numbers as text so they can be verified directly with ${vendor}.`;
      }
      if (fired.has("R5")) return `We couldn't find an open invoice from ${vendor} that matches this request. Please send the invoice number and amount.`;
      if (fired.has("R2")) return `We couldn't confirm the new bank details with ${vendor}, so nothing will be paid to them. The business owner has been notified.`;
      return "We've received your request and are verifying it before any payment is made.";
  }
}

const OVER_PROMISE = /\b(has|have|was|were|been|is being|will be)\s+(paid|sent|transferred|wired|processed|released)\b|\bpayment (is|has been) (complete|on its way|done)\b/i;
const LONG_NUMBER = /\d[\d\s-]{6,}\d/; // phone or account numbers
// Sentences that are negated or conditional ("nothing will be paid until...") don't over-promise.
const HEDGED = /\b(not|nothing|never|no|until|unless|once|after|only if)\b|n't/i;

function overPromises(text: string): boolean {
  return text.split(/(?<=[.!?])\s+/).some((sentence) => !HEDGED.test(sentence) && OVER_PROMISE.test(sentence));
}

// Countersign can pass a message on; it can't accept a meeting or answer for the owner.
const COMMITS_OWNER = /\b(is|has been|are) (scheduled|booked|confirmed)\b|\bsee you (at|on|tomorrow|then)\b|\b(works|is fine|sounds good) for (her|him|them|the owner)\b|\bwill (meet|call) you (at|on|tomorrow)\b/i;

export function isSafeReply(text: string, result: PolicyResult, paymentSent: boolean): boolean {
  if (!text.trim() || text.length > 480) return false;
  if (result.decision === "NO_ACTION" && COMMITS_OWNER.test(text)) return false;
  if (LONG_NUMBER.test(text)) return false;
  const mayClaimPayment = result.decision === "PAY" && paymentSent;
  // "will be released after cooling-off" is the one legitimate future-tense promise.
  const coolingOff = result.decision === "HOLD" && result.reasons.some((r) => /cooling-off/i.test(r));
  if (!mayClaimPayment && !coolingOff && overPromises(text)) return false;
  return true;
}
