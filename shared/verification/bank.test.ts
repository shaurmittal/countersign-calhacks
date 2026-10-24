import { describe, expect, it } from "vitest";
import { buildSeedBook } from "../seedWorld";
import type { PaymentRequest } from "../types";
import { accountLast4, compareBank, hasBankDetails } from "./bank";
import type { BookVendor } from "./types";

type Details = PaymentRequest["newBankDetails"];

/** Pixel & Pine as seeded: routing 121000248, account ending 4417. A fresh copy per call. */
function pixel(): BookVendor {
  const vendor = buildSeedBook().vendors.find((v) => v.id === "pixel");
  if (!vendor) throw new Error("seed world has no Pixel & Pine");
  return vendor;
}

describe("hasBankDetails", () => {
  it.each<[Details, boolean]>([
    [null, false],
    [{}, false],
    [{ routing: "N/A" }, false],
    [{ routing: "", account: " - " }, false],
    [{ routing: "121000248" }, true],
    [{ account: "ending 9921" }, true],
  ])("%j -> %s", (details, expected) => {
    expect(hasBankDetails(details)).toBe(expected);
  });
});

describe("accountLast4", () => {
  it.each<[string | null | undefined, string | null]>([
    ["55519921", "9921"],
    ["...4417", "4417"],
    ["0001-2345-4417", "4417"],
    ["4417", "4417"],
    ["417", null],
    ["N/A", null],
    ["", null],
    [null, null],
    [undefined, null],
  ])("%j -> %j", (account, expected) => {
    expect(accountLast4(account)).toBe(expected);
  });
});

describe("compareBank (VendorFindings.bankMatches, spec R2)", () => {
  it("is null when the request carries no bank details", () => {
    expect(compareBank(null, pixel())).toBeNull();
  });

  it("is null for empty details {}", () => {
    expect(compareBank({}, pixel())).toBeNull();
  });

  it('is null for details with no digits ({ routing: "N/A" })', () => {
    expect(compareBank({ routing: "N/A" }, pixel())).toBeNull();
  });

  it("is true when the routing and the account's last 4 both match the file", () => {
    expect(compareBank({ routing: "121-000-248", account: "0001 2345 4417" }, pixel())).toBe(true);
  });

  it("is false when the routing differs", () => {
    expect(compareBank({ routing: "021000021", account: "12344417" }, pixel())).toBe(false);
  });

  it("is false when the account's last 4 differ", () => {
    expect(compareBank({ routing: "121000248", account: "12349921" }, pixel())).toBe(false);
  });

  it("is false when the account has fewer than 4 digits", () => {
    expect(compareBank({ routing: "121000248", account: "417" }, pixel())).toBe(false);
  });

  it("is false when no vendor matched (nothing on file to match)", () => {
    expect(compareBank({ routing: "121000248", account: "4417" }, null)).toBe(false);
  });

  it("is true for a matching routing alone", () => {
    expect(compareBank({ routing: "121000248" }, pixel())).toBe(true);
  });

  it("is true for a matching account alone", () => {
    expect(compareBank({ account: "...4417" }, pixel())).toBe(true);
  });

  it("is false for the scripted scam's details (spec §7.3)", () => {
    expect(compareBank({ routing: "021000021", account: "55519921" }, pixel())).toBe(false);
  });

  it("is false when the vendor has no routing on file", () => {
    expect(compareBank({ routing: "121000248" }, { ...pixel(), bankRouting: "" })).toBe(false);
  });

  it("is false when the vendor has no last 4 on file", () => {
    expect(compareBank({ account: "4417" }, { ...pixel(), bankLast4: "" })).toBe(false);
  });

  it("ignores a part with no digits and compares the rest", () => {
    expect(compareBank({ routing: "N/A", account: "...4417" }, pixel())).toBe(true);
    expect(compareBank({ routing: "N/A", account: "...9921" }, pixel())).toBe(false);
  });

  it("known limit: another account with the same last 4 matches (the Payer pays the bank on file)", () => {
    expect(compareBank({ routing: "121000248", account: "999999994417" }, pixel())).toBe(true);
  });
});
