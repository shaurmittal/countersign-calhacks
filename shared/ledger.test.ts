import { describe, expect, it } from "vitest";
import { formatCents, paymentJournal } from "./ledger";

describe("paymentJournal", () => {
  it("balances: total debits equal total credits", () => {
    const lines = paymentJournal({ amountCents: 362_00, vendorName: "Northwind Cloud", rail: "mock" });
    const debits = lines.reduce((sum, l) => sum + l.debitCents, 0);
    const credits = lines.reduce((sum, l) => sum + l.creditCents, 0);
    expect(debits).toBe(362_00);
    expect(credits).toBe(debits);
  });

  it("debits the vendor's payable and credits cash on the rail used", () => {
    const [payable, cash] = paymentJournal({ amountCents: 1_200_00, vendorName: "Sam Ortiz", rail: "ach_sandbox" });
    expect(payable.account).toBe("Accounts Payable · Sam Ortiz");
    expect(cash.account).toBe("Cash · Operating (ACH · Increase sandbox)");
  });

  it("refuses zero, negative and fractional amounts", () => {
    expect(() => paymentJournal({ amountCents: 0, vendorName: "X", rail: "mock" })).toThrow();
    expect(() => paymentJournal({ amountCents: -5, vendorName: "X", rail: "mock" })).toThrow();
    expect(() => paymentJournal({ amountCents: 10.5, vendorName: "X", rail: "mock" })).toThrow();
  });
});

describe("formatCents", () => {
  it("formats dollars with two decimals and thousands separators", () => {
    expect(formatCents(4_800_00)).toBe("$4,800.00");
    expect(formatCents(0)).toBe("$0.00");
  });
});
