// Double-entry journal for a payment (owner: P4). Spec §3.2: the mock ledger shows journal lines.
// Pure: the Payer writes these into the audit log and the War Room renders them from the payment row.

export type PaymentRail = "ach_sandbox" | "mock";

export type JournalLine = {
  account: string;
  debitCents: number;
  creditCents: number;
};

export const RAIL_LABEL: Record<PaymentRail, string> = {
  ach_sandbox: "ACH · Increase sandbox",
  mock: "Mock ledger",
};

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Paying a vendor bill: the payable goes down (debit), operating cash goes down (credit). */
export function paymentJournal(p: { amountCents: number; vendorName: string; rail: PaymentRail }): JournalLine[] {
  if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) {
    throw new Error(`paymentJournal: amount must be a positive whole number of cents, got ${p.amountCents}`);
  }
  return [
    { account: `Accounts Payable · ${p.vendorName}`, debitCents: p.amountCents, creditCents: 0 },
    { account: `Cash · Operating (${RAIL_LABEL[p.rail]})`, debitCents: 0, creditCents: p.amountCents },
  ];
}
