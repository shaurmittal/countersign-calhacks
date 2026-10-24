import { describe, expect, it } from "vitest";
import { buildSeedBook } from "../seedWorld";
import { matchInvoice, normalizeInvoiceNumber } from "./invoices";
import type { BookInvoice, VerificationBook } from "./types";

// Fixed times, so nothing depends on the clock.
const T1 = Date.UTC(2026, 9, 20, 17);
const T2 = Date.UTC(2026, 9, 21, 17);
const NO_MATCH = { matchingInvoiceId: null, alreadyPaidAt: null };

function matched(id: string) {
  return { matchingInvoiceId: id, alreadyPaidAt: null };
}

function alreadyPaid(at: number) {
  return { matchingInvoiceId: null, alreadyPaidAt: at };
}

/** matchInvoice for one request, against the seed world unless a book is given. */
function ask(
  req: { vendorId: string | null; invoiceNumber?: string; amountCents?: number },
  book: VerificationBook = buildSeedBook(),
) {
  return matchInvoice({
    vendorId: req.vendorId,
    invoiceNumber: req.invoiceNumber ?? null,
    amountCents: req.amountCents ?? null,
    invoices: book.invoices,
    payments: book.payments,
  });
}

/** An invoice in this test's own copy of the book, to edit in place. */
function invoiceIn(book: VerificationBook, id: string): BookInvoice {
  const invoice = book.invoices.find((inv) => inv.id === id);
  if (!invoice) throw new Error(`seed book has no invoice ${id}`);
  return invoice;
}

describe("normalizeInvoiceNumber", () => {
  it.each<[string | null | undefined, string | null]>([
    ["#NW-889", "NW889"],
    ["NW-889", "NW889"],
    ["nw 889", "NW889"],
    ["Invoice #1042", "1042"],
    ["INV-1042", "1042"],
    ["inv1042", "1042"],
    ["No. 1042", "1042"],
    ["No: 1042", "1042"],
    ["Invoice No. 01042", "1042"],
    ["01042", "1042"],
    ["0000", "0"],
    ["W42", "W42"],
    ["week 42", "W42"],
    ["Wk-42", "W42"],
    ["Invoice week #42", "W42"],
    ["#", null],
    ["   ", null],
    ["", null],
    [null, null],
    [undefined, null],
  ])("%j -> %j", (raw, expected) => {
    expect(normalizeInvoiceNumber(raw)).toBe(expected);
  });

  it.each([
    ["NO1042", "NO1042"], // "NO" is a label only before a separator
    ["NOV-12", "NOV12"],
    ["INVENTORY-7", "INVENTORY7"], // "INV" is a label only before a separator or a digit
  ])("keeps a prefix that isn't a label: %j -> %j", (raw, expected) => {
    expect(normalizeInvoiceNumber(raw)).toBe(expected);
  });
});

describe("matchInvoice (spec R5 and §8.3)", () => {
  it("no vendor matched: no match, even for a number on file", () => {
    expect(ask({ vendorId: null, invoiceNumber: "NW-889" })).toEqual(NO_MATCH);
    expect(ask({ vendorId: null, amountCents: 36200 })).toEqual(NO_MATCH);
  });

  it('matches Northwind "#NW-889" with no amount (spec §7.3 happy path)', () => {
    expect(ask({ vendorId: "northwind", invoiceNumber: "#NW-889" })).toEqual(matched("inv-NW-889"));
  });

  it('matches "NW-889" for exactly the invoice amount (36200)', () => {
    expect(ask({ vendorId: "northwind", invoiceNumber: "NW-889", amountCents: 36200 })).toEqual(
      matched("inv-NW-889"),
    );
  });

  it('partial payment: "NW-889" for 18100 is a new amount, so no match (§8.3; R4 and R5 apply)', () => {
    expect(ask({ vendorId: "northwind", invoiceNumber: "NW-889", amountCents: 18100 })).toEqual(NO_MATCH);
  });

  it("never matches another vendor's invoice: Pixel's 1042 asked for under Northwind", () => {
    expect(ask({ vendorId: "northwind", invoiceNumber: "1042" })).toEqual(NO_MATCH);
  });

  it("a number not on file gets no match, even when the vendor has one open invoice", () => {
    expect(ask({ vendorId: "northwind", invoiceNumber: "NW-999" })).toEqual(NO_MATCH);
  });

  it('normalizes the stored number too: "#42" finds a stored "INV-0042"', () => {
    const book = buildSeedBook();
    book.invoices.push({ ...invoiceIn(book, "inv-1042"), id: "inv-H42", vendorId: "harbor", number: "INV-0042" });
    expect(ask({ vendorId: "harbor", invoiceNumber: "#42" }, book)).toEqual(matched("inv-H42"));
  });

  it("matches Sam's \"week 42\" to W42", () => {
    expect(ask({ vendorId: "sam", invoiceNumber: "week 42" })).toEqual(matched("inv-W42"));
  });

  it("neither number nor amount: Sam's only open invoice, W42 (spec §7.4 \"this week\")", () => {
    expect(ask({ vendorId: "sam" })).toEqual(matched("inv-W42"));
  });

  it("neither number nor amount: two open Sam invoices are ambiguous, so no match", () => {
    const book = buildSeedBook();
    book.invoices.push({ ...invoiceIn(book, "inv-W42"), id: "inv-W43", number: "W43" });
    expect(ask({ vendorId: "sam" }, book)).toEqual(NO_MATCH);
  });

  it('a number that normalizes to nothing ("#") counts as no number', () => {
    expect(ask({ vendorId: "sam", invoiceNumber: "#" })).toEqual(matched("inv-W42"));
  });

  it("amount only: the one open invoice with exactly that amount matches", () => {
    const book = buildSeedBook();
    book.invoices.push({ ...invoiceIn(book, "inv-NW-889"), id: "inv-NW-890", number: "NW-890", amountCents: 41000 });
    expect(ask({ vendorId: "northwind", amountCents: 36200 }, book)).toEqual(matched("inv-NW-889"));
  });

  it("amount only: two open invoices with that amount are ambiguous, so no match", () => {
    const book = buildSeedBook();
    book.invoices.push({ ...invoiceIn(book, "inv-NW-889"), id: "inv-NW-890", number: "NW-890" });
    expect(ask({ vendorId: "northwind", amountCents: 36200 }, book)).toEqual(NO_MATCH);
  });

  it("amount only: no open invoice with that amount, so no match", () => {
    expect(ask({ vendorId: "northwind", amountCents: 99900 })).toEqual(NO_MATCH);
  });

  it("duplicate: a paid invoice reports alreadyPaidAt = its paidAt (§8.3)", () => {
    const book = buildSeedBook();
    const nw = invoiceIn(book, "inv-NW-889");
    nw.status = "paid";
    nw.paidAt = T1;
    expect(ask({ vendorId: "northwind", invoiceNumber: "NW-889" }, book)).toEqual(alreadyPaid(T1));
  });

  it("duplicate: a paid invoice is caught even when the amount differs", () => {
    const book = buildSeedBook();
    const nw = invoiceIn(book, "inv-NW-889");
    nw.status = "paid";
    nw.paidAt = T1;
    expect(ask({ vendorId: "northwind", invoiceNumber: "NW-889", amountCents: 18100 }, book)).toEqual(
      alreadyPaid(T1),
    );
  });

  it("a paid invoice without paidAt reports its earliest payment", () => {
    const book = buildSeedBook();
    invoiceIn(book, "inv-NW-889").status = "paid";
    book.payments.push(
      { invoiceId: "inv-NW-889", vendorId: "northwind", status: "sent", createdAt: T2 },
      { invoiceId: "inv-NW-889", vendorId: "northwind", status: "sent", createdAt: T1 },
    );
    expect(ask({ vendorId: "northwind", invoiceNumber: "NW-889" }, book)).toEqual(alreadyPaid(T1));
  });

  it("a paid invoice with neither paidAt nor a payment reports 0, still a duplicate", () => {
    const book = buildSeedBook();
    invoiceIn(book, "inv-NW-889").status = "paid";
    expect(ask({ vendorId: "northwind", invoiceNumber: "NW-889" }, book)).toEqual(alreadyPaid(0));
  });

  it.each(["sent", "pending"] as const)("an open invoice with a %s payment counts as paid", (status) => {
    const book = buildSeedBook();
    book.payments.push({ invoiceId: "inv-NW-889", vendorId: "northwind", status, createdAt: T1 });
    expect(ask({ vendorId: "northwind", invoiceNumber: "NW-889" }, book)).toEqual(alreadyPaid(T1));
  });

  it("payments for other invoices, or for no invoice, don't mark this one paid", () => {
    const book = buildSeedBook();
    book.payments.push(
      { invoiceId: "inv-1042", vendorId: "pixel", status: "sent", createdAt: T1 },
      { invoiceId: null, vendorId: "northwind", status: "sent", createdAt: T1 },
    );
    expect(ask({ vendorId: "northwind", invoiceNumber: "NW-889" }, book)).toEqual(matched("inv-NW-889"));
  });

  it("without a number, an invoice with a payment in flight is skipped, so a repeat can't pay it twice", () => {
    const book = buildSeedBook();
    book.payments.push({ invoiceId: "inv-W42", vendorId: "sam", status: "pending", createdAt: T1 });
    expect(ask({ vendorId: "sam" }, book)).toEqual(NO_MATCH);
    expect(ask({ vendorId: "sam", amountCents: 120000 }, book)).toEqual(NO_MATCH);
  });

  it("a void invoice never matches, by number, by amount or as the only open invoice", () => {
    const book = buildSeedBook();
    invoiceIn(book, "inv-NW-889").status = "void";
    expect(ask({ vendorId: "northwind", invoiceNumber: "NW-889" }, book)).toEqual(NO_MATCH);
    expect(ask({ vendorId: "northwind", amountCents: 36200 }, book)).toEqual(NO_MATCH);
    expect(ask({ vendorId: "northwind" }, book)).toEqual(NO_MATCH);
  });

  it("two open invoices with the same number are ambiguous, so no match", () => {
    const book = buildSeedBook();
    book.invoices.push({ ...invoiceIn(book, "inv-NW-889"), id: "inv-NW-889-b", number: "nw 889" });
    expect(ask({ vendorId: "northwind", invoiceNumber: "NW-889" }, book)).toEqual(NO_MATCH);
  });

  it("a paid invoice blocks a repeat even when an open one shares its number (§8.3 key: vendor + number)", () => {
    const book = buildSeedBook();
    book.invoices.push({ ...invoiceIn(book, "inv-NW-889"), id: "inv-NW-889-old", status: "paid", paidAt: T1 });
    expect(ask({ vendorId: "northwind", invoiceNumber: "NW-889" }, book)).toEqual(alreadyPaid(T1));
  });
});
