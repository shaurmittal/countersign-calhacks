// Policy Engine (owner: P1). The ONLY code that can say PAY.
// Rules: pure function, no LLM, no I/O, no Date.now() (use input.now). Unit-test every rule.
//
// Every rule that matches produces a "hit" with an effect. The strongest effect wins:
//   BLOCK    refuse. R8/R9/R13 cannot be overridden by anyone.
//   HOLD     waiting on something outside the owner's control (callback, invoice, cooling-off).
//   ESCALATE the real owner must approve via step-up (OTP / ASI:One). An approval satisfies it.
//   NOTE     the rule fired but is already satisfied (e.g. callback confirmed). Shown, not blocking.
// PAY (R12) is returned only when there are no BLOCK/HOLD/unsatisfied ESCALATE hits AND the
// positive checks pass: known vendor, matching open invoice, known USD amount.
import type { DenyListHit, MessageType, PolicyInput, PolicyResult, RuleId } from "../types";
import { RULES } from "./rules";

type Effect = "BLOCK" | "HOLD" | "ESCALATE" | "NOTE";
type Hit = { rule: RuleId; effect: Effect; reason: string; needsCallback?: boolean };

const FORBIDDEN_ACTIONS = new Set(["gift_cards", "crypto"]);
const BANK_CHANGE_ACTIONS = new Set(["change_bank", "update_payroll"]);
// Roles that claim to BE the payee ("Pixel & Pine here", "it's Sam, send my pay").
const PAYEE_ROLES = new Set(["vendor", "employee"]);

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const DENY_SOURCES: Record<DenyListHit["source"], string> = {
  sender: "the sender",
  message: "a domain in the message",
  bank: "the bank account",
};

/** "On the owner's deny list: the sender and the bank account". Names the place, never the value. */
function denyListReason(hits: readonly DenyListHit[]): string {
  const places = [...new Set(hits.map((h) => DENY_SOURCES[h.source]))];
  return `On the owner's deny list: ${places.join(" and ")}`;
}

/** What a message that asks for no money is, and what happens to it. Shown in the War Room and the owner's summary. */
export const TRIAGE: Record<MessageType, string> = {
  payment: "nothing to pay",
  meeting: "a meeting request, passed to the owner",
  question: "a question, answered and passed to the owner",
  vendor_update: "a vendor update, passed to the owner",
  invoice_dispute: "a question about an invoice, passed to the owner",
  sales_or_spam: "sales or spam, filtered",
  phishing: "a phishing attempt, refused",
  data_request: "a request for data, refused",
  other: "a message, passed to the owner",
};

/** The sensitive thing a message asks for (R18): what the parser named, or what its type implies. */
function sensitiveAsk(req: PolicyInput["request"]): string | null {
  if (req.sensitiveAsk) return req.sensitiveAsk;
  if (req.messageType === "phishing") return "a log-in through a link";
  if (req.messageType === "data_request") return "sensitive data";
  return null;
}

export function decide(input: PolicyInput): PolicyResult {
  const { request: req, vendor, vendorFindings: vf, riskFindings: rf, invoice, policy, now } = input;
  const cb = input.callbackOutcome;
  const flags = new Set(rf?.flags ?? []);
  const hits: Hit[] = [];
  const hit = (rule: RuleId, effect: Effect, reason: string, needsCallback = false) =>
    hits.push({ rule, effect, reason, needsCallback });

  const noMoney = req.requestedAction === "none" && !req.parseFailed && req.amountCents == null && req.newBankDetails == null;
  const sensitive = sensitiveAsk(req);

  // Not a payment, but asks for something no business hands over (passwords, codes, W-2s, a log-in link).
  if (noMoney && sensitive) {
    return {
      decision: "BLOCK",
      firedRules: ["R18"],
      reasons: [`R18 ${RULES.R18.name}: The message asks for ${sensitive}; Countersign never sends that to anyone`],
      needs: { callback: false, ownerOtp: false, coolingOffSeconds: 0 },
      overridable: false,
    };
  }

  // Nothing to pay ("hi", "can we chat tomorrow?"): triaged, then forwarded to the owner or filtered.
  if (noMoney) {
    return {
      decision: "NO_ACTION",
      firedRules: [],
      reasons: [`No payment was requested: ${TRIAGE[req.messageType ?? "other"]}`],
      needs: { callback: false, ownerOtp: false, coolingOffSeconds: 0 },
      overridable: true,
    };
  }

  // ---- Hard stops ----
  if (sensitive) hit("R18", "BLOCK", `The message also asks for ${sensitive}; Countersign never sends that to anyone`);
  if (vf?.ofacHit) hit("R8", "BLOCK", "The beneficiary matches the OFAC sanctions list");
  if (FORBIDDEN_ACTIONS.has(req.requestedAction) || flags.has("forbidden_rail")) {
    hit("R9", "BLOCK", "Gift cards, crypto and wires to personal accounts are never allowed");
  }
  if (cb === "denied") hit("R10", "BLOCK", "The vendor, called on the number on file, said they did not send this");
  if (vf?.alreadyPaidAt != null || invoice?.status === "paid") {
    const paidAt = vf?.alreadyPaidAt ?? invoice?.paidAt ?? null;
    const when = paidAt != null ? ` on ${new Date(paidAt).toISOString().slice(0, 10)}` : "";
    hit("R13", "BLOCK", `This invoice was already paid${when}`);
  }
  // The owner's own block list. Like every BLOCK, an approval can't lift it; the owner removes the entry instead.
  if (vf?.denyListHits?.length) hit("R16", "BLOCK", denyListReason(vf.denyListHits));
  // A forged From: the address is one we know (a vendor's or the owner's), but its domain says it didn't send it.
  const email = vf?.emailAuth;
  if (email?.spoofsOnFile) hit("R17", "BLOCK", "The sender's address is on file, but the email failed authentication: it was forged");

  // ---- Missing or unavailable data: never pay on what we could not check ----
  if (req.parseFailed) hit("R14", "HOLD", "The request could not be read reliably");
  if (req.multipleRequests) hit("R14", "HOLD", "Several payments in one message; each must be sent separately");
  if (!req.parseFailed && !vf) hit("R14", "HOLD", "The vendor check did not complete");
  if (!req.parseFailed && !rf) hit("R14", "HOLD", "The risk check did not complete");
  if (vf?.crs.status === "unavailable") hit("R14", "ESCALATE", "Identity service (CRS) was unavailable");
  if (vf?.crs.status === "ok" && vf.crs.businessVerified === false) {
    hit("R14", "ESCALATE", "Identity service (CRS) could not verify the business");
  }
  if (req.currency.toUpperCase() !== "USD") hit("R14", "HOLD", `Non-USD currency (${req.currency})`);

  // ---- Social engineering signals ----
  if (req.claimedSenderRole === "owner" || flags.has("owner_impersonation")) {
    hit("R11", "ESCALATE", "The sender claims to be the owner; the owner approves only via OTP on the registered device");
  }
  if (req.injectionAttempt || flags.has("injection_attempt")) {
    hit("R15", "ESCALATE", "The message tries to give the system instructions");
  }

  // ---- Email authentication beyond a forged on-file address ----
  if (email && !email.spoofsOnFile && email.verdict === "fail") {
    hit("R17", "ESCALATE", "The email failed authentication for its own domain");
  }
  if (email?.displayNameClaims) {
    hit("R17", "ESCALATE", `The sender's display name poses as ${email.displayNameClaims}, which isn't the address it came from`);
  }

  // ---- Vendor-specific rules ----
  const vendorKnown = !!vf && !!vf.vendorId && !!vendor && vf.vendorId === vendor.id;
  if (vf && !req.parseFailed && !vendorKnown) {
    hit("R1", "BLOCK", req.claimedVendorName ? `"${req.claimedVendorName}" is not in the vendor book` : "No known vendor in the request");
  }

  const amount = req.amountCents ?? invoice?.amountCents ?? null;
  let invoiceOk = false;

  if (vendorKnown && vf && vendor) {
    const bankChange =
      (req.newBankDetails != null && vf.bankMatches !== true) || BANK_CHANGE_ACTIONS.has(req.requestedAction);
    // "I switched banks, details to follow": nothing to confirm and nothing to save, so no callback and
    // no PAY path; the requester is asked for the account. (The pipeline's bank update needs the details.)
    if (bankChange && req.newBankDetails == null) {
      hit("R2", "HOLD", `A bank change for ${vendor.name} needs the new account details; none were given`);
    } else if (bankChange) {
      if (cb === null) hit("R2", "HOLD", `New bank details: calling ${vendor.name} on the number on file`, true);
      else if (cb === "confirmed") hit("R2", "ESCALATE", `${vendor.name} confirmed the new account; the owner must approve it`);
      else if (cb === "denied") hit("R2", "NOTE", "New bank details (denied by the vendor)");
      else hit("R2", "HOLD", `Could not confirm the new account with ${vendor.name}; bank changes are never paid unconfirmed`);
    }

    // An email address is only "on file" when the email is authenticated. Checked here as well as in the
    // Vendor Verifier, so no findings, however they were built, can let a typed From line through.
    const senderOnFile = vf.senderOnFile && (!email || email.verdict === "pass");
    // A trust entry makes senderOnFile true and nothing else: R2, R4-R7 and the invoice check still run below.
    if (vf.trustedByOwner && senderOnFile) hit("R3", "NOTE", `The owner's trust list ties this sender to ${vendor.name}`);
    // Someone not on file who speaks for the payee, or who asks to change where the payee is paid. The second
    // part doesn't depend on how the model labelled the sender: "it's Sam, send my pay here" reads as vendor,
    // employee or unknown from run to run, and only the payee would ask to change the payee's own account.
    const actsForPayee = PAYEE_ROLES.has(req.claimedSenderRole) || BANK_CHANGE_ACTIONS.has(req.requestedAction);
    if (!senderOnFile && actsForPayee) {
      if (cb === null) hit("R3", "HOLD", `Sender is not on file for ${vendor.name}: calling back on the number on file`, true);
      else if (cb === "confirmed") hit("R3", "NOTE", `Sender not on file, but ${vendor.name} confirmed by callback`);
      else if (cb === "denied") hit("R3", "NOTE", "Sender not on file (denied by the vendor)");
      else hit("R3", "ESCALATE", `Sender not on file and ${vendor.name} could not be reached`);
    }

    // Email tricks that don't need a forged domain. Replies diverted elsewhere: confirm with the vendor first.
    if (email?.replyToDomain) {
      const where = `replies go to ${email.replyToDomain}, not the sender's domain`;
      if (cb === null) hit("R17", "HOLD", `The email ${where}: calling ${vendor.name} on the number on file`, true);
      else if (cb === "confirmed") hit("R17", "NOTE", `The email ${where}; ${vendor.name} confirmed by callback`);
      else if (cb === "denied") hit("R17", "NOTE", `The email ${where} (denied by the vendor)`);
      else hit("R17", "ESCALATE", `The email ${where} and ${vendor.name} could not be reached`);
    }

    invoiceOk =
      !!vf.matchingInvoiceId &&
      !!invoice &&
      invoice.id === vf.matchingInvoiceId &&
      invoice.status === "open" &&
      (req.amountCents == null || req.amountCents === invoice.amountCents);
    if (!invoiceOk && invoice?.status !== "paid" && vf.alreadyPaidAt == null) {
      hit("R5", "HOLD", `No open invoice from ${vendor.name} matches this request; asking for the invoice`);
    }

    if (amount == null) {
      hit("R14", "HOLD", "No amount in the request");
    } else {
      const [min, max] = vendor.typicalAmountRange;
      if (amount > max * (1 + policy.amountAnomalyPct) || amount < min * (1 - policy.amountAnomalyPct)) {
        hit("R4", "ESCALATE", `${formatCents(amount)} is outside ${vendor.name}'s usual ${formatCents(min)}-${formatCents(max)}`);
      }
      if (amount > policy.autoPayLimitCents) {
        hit("R6", "ESCALATE", `${formatCents(amount)} is over the ${formatCents(policy.autoPayLimitCents)} auto-pay limit`);
      } else if (vendor.alwaysEscalate) {
        hit("R6", "ESCALATE", `${vendor.name} is never auto-paid; the owner approves every payment`);
      }
      if (amount > policy.coolingOffThresholdCents) {
        hit("R7", "ESCALATE", `${formatCents(amount)} is over ${formatCents(policy.coolingOffThresholdCents)}: OTP plus a ${policy.coolingOffSeconds}s cooling-off`);
      }
    }
  }

  // ---- Owner step-up: an approval satisfies ESCALATE hits, never BLOCK or HOLD ----
  const approval = input.approval;
  const escalations = hits.filter((h) => h.effect === "ESCALATE");
  if (approval && escalations.length > 0) {
    if (approval.cancelled) {
      hit(escalations[0].rule, "BLOCK", "The owner declined this payment");
    } else if (approval.approved) {
      for (const h of escalations) {
        h.effect = "NOTE";
        h.reason += ` (approved by the owner via ${approval.method === "otp" ? "OTP" : "ASI:One"})`;
      }
      if (escalations.some((h) => h.rule === "R7")) {
        if (approval.coolingOffUntil == null) hit("R7", "HOLD", "Cooling-off has not started");
        else if (now < approval.coolingOffUntil) {
          // No seconds in the text: the result is stored, and the War Room shows a live countdown beside it.
          hit("R7", "HOLD", "Cooling-off running; the owner can still cancel");
        }
      }
    }
  }

  return resolve(hits, { vendorKnown, invoiceOk, amount, policy });
}

function resolve(
  hits: Hit[],
  ctx: { vendorKnown: boolean; invoiceOk: boolean; amount: number | null; policy: PolicyInput["policy"] },
): PolicyResult {
  const has = (e: Effect) => hits.some((h) => h.effect === e);
  const noNeeds = { callback: false, ownerOtp: false, coolingOffSeconds: 0 };
  const out = (decision: PolicyResult["decision"], needs = noNeeds, overridable = true): PolicyResult => ({
    decision,
    firedRules: sortRules([...new Set(hits.map((h) => h.rule))]),
    reasons: hits.map((h) => `${h.rule} ${RULES[h.rule].name}: ${h.reason}`),
    needs,
    overridable,
  });

  if (has("BLOCK")) {
    // Refused outright, so the callbacks other rules asked for never happen; their reasons must not say they do.
    for (const h of hits) {
      if (h.needsCallback) h.reason = `${h.reason.replace(/:\s*calling .*$/i, "")} (no callback: already refused)`;
    }
    const blocking = hits.filter((h) => h.effect === "BLOCK");
    return out("BLOCK", noNeeds, blocking.every((h) => RULES[h.rule].overridable));
  }
  if (has("HOLD")) {
    return out("HOLD", { ...noNeeds, callback: hits.some((h) => h.needsCallback) });
  }
  if (has("ESCALATE")) {
    const cooling = hits.some((h) => h.rule === "R7" && h.effect === "ESCALATE");
    return out("ESCALATE", { callback: false, ownerOtp: true, coolingOffSeconds: cooling ? ctx.policy.coolingOffSeconds : 0 });
  }
  if (ctx.vendorKnown && ctx.invoiceOk && ctx.amount != null) {
    hits.push({ rule: "R12", effect: "NOTE", reason: `Known vendor, bank on file, open invoice, ${formatCents(ctx.amount)}` });
    return out("PAY");
  }
  // Unreachable in practice; if a gap in the rules ever lands here, hold rather than pay.
  hits.push({ rule: "R14", effect: "HOLD", reason: "Not every check passed (fail-safe)" });
  return out("HOLD");
}

function sortRules(rules: RuleId[]): RuleId[] {
  return rules.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}
