// Invoice matching for the Vendor Verifier (owner: P3). Spec §5 R5, §8.3 (duplicate and partial payments).
// Pure: no I/O, no clock. Anything missing or ambiguous returns no match, so R5 holds the case.
import type { BookInvoice, BookPayment, InvoiceMatch } from "./types";

const LEADING_SEPARATORS = /^[^A-Z0-9]+/; // "#", spaces, punctuation
const INVOICE_LABEL = /^(?:INVOICE|INV)(?=[^A-Z])/; // before a separator or a digit: "INV-1042", "inv1042"
const NUMBER_LABEL = /^(?:NUMBER|NUM|NBR|NO)(?=[^A-Z0-9])/; // only before a separator: "No. 1042", not "NOV12"
const WEEK = /^(?:WEEK|WK)[^A-Z0-9]*(\d+)$/; // "week 42", "Wk-42"

/**
 * Canonical invoice number, applied to the request and to the book alike ("Invoice #01042" -> "1042",
 * "#NW-889" -> "NW889", "week 42" -> "W42"). null when nothing is left.
 */
export function normalizeInvoiceNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().toUpperCase();
  let prev: string;
  do {
    prev = s;
    s = s.replace(LEADING_SEPARATORS, "").replace(INVOICE_LABEL, "").replace(NUMBER_LABEL, "");
  } while (s !== prev);
  const week = WEEK.exec(s);
  if (week) s = `W${week[1]}`;
  s = s.replace(/[^A-Z0-9]/g, "");
  if (/^\d+$/.test(s)) s = s.replace(/^0+(?=\d)/, "");
  return s === "" ? null : s;
}

/**
 * VendorFindings.matchingInvoiceId and alreadyPaidAt. Only the matched vendor's non-void invoices
 * count. A number picks the invoice. Without one, the exact amount does, and with neither, the
 * vendor's only open invoice ("Pay Sam Ortiz's invoice for this week", spec §7.4).
 */
export function matchInvoice(args: {
  vendorId: string | null;
  invoiceNumber: string | null;
  amountCents: number | null;
  invoices: readonly BookInvoice[];
  payments: readonly BookPayment[];
}): InvoiceMatch {
  const { vendorId, invoiceNumber, amountCents, invoices, payments } = args;
  if (vendorId === null) return noMatch();
  const candidates = invoices.filter((inv) => inv.vendorId === vendorId && inv.status !== "void");
  const firstPayment = firstPaymentTimes(payments);
  const wanted = normalizeInvoiceNumber(invoiceNumber);

  if (wanted !== null) {
    const sameNumber = candidates.filter((inv) => normalizeInvoiceNumber(inv.number) === wanted);
    // Payments are keyed on vendor + invoice number (§8.3), so any paid or in-flight copy makes this a duplicate.
    const paidTimes = sameNumber.map((inv) => paidTime(inv, firstPayment)).filter((t): t is number => t !== null);
    if (paidTimes.length > 0) return { matchingInvoiceId: null, alreadyPaidAt: Math.min(...paidTimes) };
    // Not on file, or two open invoices share the number: don't guess.
    if (sameNumber.length !== 1) return noMatch();
    const invoice = sameNumber[0];
    // A partial or different amount is a new amount (§8.3), so R4 and R5 apply to it.
    if (amountCents !== null && amountCents !== invoice.amountCents) return noMatch();
    return { matchingInvoiceId: invoice.id, alreadyPaidAt: null };
  }

  const unpaid = candidates.filter((inv) => inv.status === "open" && paidTime(inv, firstPayment) === null);
  const fits = amountCents === null ? unpaid : unpaid.filter((inv) => inv.amountCents === amountCents);
  return fits.length === 1 ? { matchingInvoiceId: fits[0].id, alreadyPaidAt: null } : noMatch();
}

// A fresh object per call, so a caller editing its result can't change later results.
function noMatch(): InvoiceMatch {
  return { matchingInvoiceId: null, alreadyPaidAt: null };
}

/** Earliest payment time per invoice id. The loader leaves failed payments out of the book. */
function firstPaymentTimes(payments: readonly BookPayment[]): Map<string, number> {
  const first = new Map<string, number>();
  for (const p of payments) {
    if (p.invoiceId === null) continue;
    const seen = first.get(p.invoiceId);
    if (seen === undefined || p.createdAt < seen) first.set(p.invoiceId, p.createdAt);
  }
  return first;
}

/** When the invoice was paid, or null if unpaid. A payment still in flight counts, to stop a double payment. */
function paidTime(invoice: BookInvoice, firstPayment: ReadonlyMap<string, number>): number | null {
  const paymentAt = firstPayment.get(invoice.id) ?? null;
  // A paid invoice with no date on record reports 0: still non-null, so the duplicate is caught.
  if (invoice.status === "paid") return invoice.paidAt ?? paymentAt ?? 0;
  return paymentAt;
}
