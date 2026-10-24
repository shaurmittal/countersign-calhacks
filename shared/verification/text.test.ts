import { describe, expect, it } from "vitest";
import {
  digitsOnly,
  emailDomain,
  isPhoneLike,
  isSameOrSubdomain,
  normalizeEmail,
  normalizePhone,
  osaDistance,
  similarity,
} from "./text";

describe("osaDistance", () => {
  it.each([
    ["", "abc", 3],
    ["abc", "", 3],
    ["abc", "abc", 0],
    ["pixel", "pixle", 1], // adjacent swap counts once
    ["northwind", "nortwind", 1],
    ["kitten", "sitting", 3],
    ["ca", "abc", 3], // OSA, not full Damerau (which gives 2)
  ])("%s -> %s = %i", (a, b, expected) => {
    expect(osaDistance(a, b)).toBe(expected);
  });
});

describe("similarity", () => {
  it("is 1 for identical strings and 0 for blanks", () => {
    expect(similarity("pixelpine", "pixelpine")).toBe(1);
    expect(similarity("", "")).toBe(0);
    expect(similarity("abc", "")).toBe(0);
  });

  it("scores a one-letter typo in a 9-letter name at about 0.89", () => {
    expect(similarity("pixlepine", "pixelpine")).toBeCloseTo(8 / 9, 5);
  });
});

describe("phone normalization", () => {
  it.each([
    ["+15555550100", "15555550100"],
    ["+1 (555) 555-0100", "15555550100"],
    ["555-555-0100", "15555550100"],
    ["5555550100", "15555550100"],
    ["+44 20 7946 0958", "442079460958"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each(["billing@pixelandpine.example", "agent1qw8s5j9f0example", "12345", "", "call me"])(
    "%s is not a phone number",
    (raw) => {
      expect(isPhoneLike(raw)).toBe(false);
      expect(normalizePhone(raw)).toBe("");
    },
  );

  it("digitsOnly strips everything else", () => {
    expect(digitsOnly("routing 021-000-021")).toBe("021000021");
  });
});

describe("email normalization", () => {
  it("lowercases and reads the address out of a display name", () => {
    expect(normalizeEmail("Pixel & Pine <Billing@PixelAndPine.example>")).toBe("billing@pixelandpine.example");
    expect(normalizeEmail("  mailto:Sam.Ortiz@Mail.example ")).toBe("sam.ortiz@mail.example");
  });

  it.each(["+15555550100", "agent1qw8s5j9f0example", "not an email", "a@b", ""])("%s is not an email", (raw) => {
    expect(normalizeEmail(raw)).toBe("");
    expect(emailDomain(raw)).toBe("");
  });

  it("emailDomain returns the lowercased domain", () => {
    expect(emailDomain("invoices@NorthwindCloud.example")).toBe("northwindcloud.example");
  });
});

describe("isSameOrSubdomain", () => {
  it.each([
    ["northwindcloud.example", "northwindcloud.example", true],
    ["ap.billing.northwindcloud.example", "northwindcloud.example", true],
    ["NorthwindCloud.Example.", "northwindcloud.example", true],
    ["evilnorthwindcloud.example", "northwindcloud.example", false],
    ["northwindcloud.example.evil.net", "northwindcloud.example", false],
    ["", "northwindcloud.example", false],
    ["northwindcloud.example", "", false],
  ])("%s under %s = %s", (host, domain, expected) => {
    expect(isSameOrSubdomain(host, domain)).toBe(expected);
  });
});
