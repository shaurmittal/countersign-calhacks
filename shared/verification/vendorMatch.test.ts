import { describe, expect, it } from "vitest";
import { buildSeedBook } from "../seedWorld";
import type { BookOwner, BookVendor, VendorMatch } from "./types";
import {
  checkSender,
  coreTokens,
  isKnownBadSender,
  isOwnerAddress,
  MATCH_THRESHOLD,
  matchVendor,
  nameScore,
  normalizeName,
  senderMatchesVendor,
} from "./vendorMatch";

const UNKNOWN_PHONE = "+15555559001";
const NONE: VendorMatch = { vendorId: null, confidence: 0, method: "none", matchedOn: null };

function vendorIn(vendors: readonly BookVendor[], id: string): BookVendor {
  const vendor = vendors.find((v) => v.id === id);
  if (!vendor) throw new Error(`no vendor ${id}`);
  return vendor;
}

function seedOwner(): BookOwner {
  const owner = buildSeedBook().owner;
  if (!owner) throw new Error("seed book has no owner");
  return owner;
}

/** A vendor the seed world doesn't have. Contact fields stay blank unless the test sets them. */
function extraVendor(fields: Pick<BookVendor, "id" | "name"> & Partial<BookVendor>): BookVendor {
  return {
    aliases: [],
    domains: [],
    phoneOnFile: "",
    emailsOnFile: [],
    bankLast4: "0000",
    bankRouting: "000000000",
    typicalAmountRange: [0, 0],
    cadence: "irregular",
    ...fields,
  };
}

function seedVendorsWith(...extra: BookVendor[]): BookVendor[] {
  return [...buildSeedBook().vendors, ...extra];
}

describe("normalizeName", () => {
  it.each([
    ["Pixel & Pine", "pixel and pine"],
    ["  Harbor   Legal, LLP. ", "harbor legal llp"],
    ["Sam Ortiz's", "sam ortiz"],
    ["Sam Ortiz’s", "sam ortiz"],
    ["Sam's Club", "sam club"],
    ["O'Shea", "o shea"], // 's inside a word is not a possessive
    ["Café Zoë", "cafe zoe"],
    ["Ｐｉｘｅｌ ＆ Ｐｉｎｅ", "pixel and pine"], // fullwidth letters fold to ASCII (NFKD)
    ["!!!", ""],
  ])("%j -> %j", (raw, expected) => {
    expect(normalizeName(raw)).toBe(expected);
  });
});

describe("coreTokens", () => {
  it.each([
    ["The Pixel & Pine Design Co.", ["pixel", "pine", "design"]],
    ["Harbor Legal, LLP", ["harbor", "legal"]],
    ["Dr. Sam Ortiz", ["sam", "ortiz"]],
    ["The Company, Inc.", []],
    ["", []],
  ])("%j -> %j", (raw, expected) => {
    expect(coreTokens(raw)).toEqual(expected);
  });
});

describe("nameScore", () => {
  it("a: a side that normalizes to nothing scores 0, even against itself", () => {
    expect(nameScore("", "Pixel & Pine")).toBe(0);
    expect(nameScore("Pixel & Pine", "  ")).toBe(0);
    expect(nameScore("!!!", "!!!")).toBe(0);
  });

  it("b: names equal after normalization score 1", () => {
    expect(nameScore("PIXEL and pine", "Pixel & Pine")).toBe(1);
  });

  it("c: the same letters once spaces, stopwords and legal suffixes go score 0.97", () => {
    expect(nameScore("PixelPine", "Pixel & Pine")).toBe(0.97);
    expect(nameScore("Harbor Legal, LLP", "Harbor Legal")).toBe(0.97);
  });

  it("d: claimed tokens inside the candidate score 0.85 + 0.10 x the share they cover", () => {
    expect(nameScore("Pine", "Pixel & Pine")).toBeCloseTo(0.9, 10);
    expect(nameScore("Pine", "Pixel & Pine Design")).toBeCloseTo(0.85 + 0.1 / 3, 10);
  });

  it("d: a candidate of two or more tokens inside a longer claim scores the same way", () => {
    expect(nameScore("Northwind Cloud billing team", "Northwind Cloud")).toBeCloseTo(0.9, 10);
  });

  it("d: generic words alone are not distinctive, so they fall through to similarity", () => {
    expect(nameScore("Design", "Pixel & Pine Design")).toBeCloseTo(1 - 9 / 15, 10);
    expect(nameScore("Cloud", "Northwind Cloud")).toBeLessThan(MATCH_THRESHOLD);
  });

  it("d: a one-word candidate never matches inside a longer claim", () => {
    expect(nameScore("Sam's Club", "Sam")).toBeCloseTo(1 - 4 / 7, 10);
  });

  it("e: with generic words set aside, the claimed words inside the candidate score the same way", () => {
    expect(nameScore("Northwind billing", "Northwind")).toBeCloseTo(0.95, 10);
    expect(nameScore("Harbor billing", "Harbor Legal")).toBeCloseTo(0.95, 10);
    expect(nameScore("Pixel billing team", "Pixel & Pine")).toBeCloseTo(0.9, 10);
  });

  it("e: a non-generic word the vendor doesn't have still blocks the match", () => {
    expect(nameScore("Sam Plumbing", "Sam")).toBeLessThan(MATCH_THRESHOLD);
    expect(nameScore("Google Cloud billing", "Northwind Cloud")).toBeLessThan(MATCH_THRESHOLD);
    expect(nameScore("Cloud billing", "Northwind Cloud")).toBeLessThan(MATCH_THRESHOLD);
  });

  it("f: otherwise the similarity of the compact core strings", () => {
    expect(nameScore("Pixle & Pine", "Pixel & Pine")).toBeCloseTo(8 / 9, 10);
    expect(nameScore("Pam", "Sam")).toBeLessThan(MATCH_THRESHOLD);
  });
});

describe("matchVendor by name (seed book)", () => {
  it.each([
    ["Pixel & Pine", "pixel", 1, "Pixel & Pine"],
    ["pixel and pine", "pixel", 1, "Pixel and Pine"],
    ["PixelPine", "pixel", 1, "PixelPine"],
    ["Pixel & Pine Design LLC", "pixel", 0.97, "Pixel & Pine Design"],
    ["Pixel & Pine Designs", "pixel", 0.95, "Pixel & Pine Design"],
    ["Pixle & Pine", "pixel", 0.89, "Pixel and Pine"],
    ["Pine", "pixel", 0.9, "Pixel and Pine"],
    ["Northwind", "northwind", 1, "Northwind"],
    ["Northwind Cloud billing team", "northwind", 0.95, "Northwind"],
    ["Northwind billing", "northwind", 0.95, "Northwind Cloud"],
    ["Harbor billing", "harbor", 0.95, "Harbor Legal"],
    ["Nortwind Cloud", "northwind", 0.93, "Northwind Cloud"],
    ["Harbor", "harbor", 0.9, "Harbor Legal"],
    ["Harbor Legal, LLP", "harbor", 1, "Harbor Legal LLP"],
    ["Sam Ortiz's", "sam", 1, "Sam Ortiz"],
    ["Ortiz", "sam", 0.9, "Sam Ortiz"],
    ["Samuel", "sam", 0.9, "Samuel Ortiz"],
  ])("%j matches %s at %s on %j", (claimed, vendorId, confidence, matchedOn) => {
    expect(matchVendor(claimed, UNKNOWN_PHONE, buildSeedBook().vendors)).toEqual({
      vendorId,
      confidence,
      method: "name",
      matchedOn,
    });
  });

  it.each([
    "AWS",
    "Amazon Web Services",
    "Google Workspace",
    "Apple",
    "Design",
    "Cloud",
    "Legal",
    "Sam's Club",
    "Pam",
    "North",
    "",
  ])("%j matches no vendor", (claimed) => {
    expect(matchVendor(claimed, UNKNOWN_PHONE, buildSeedBook().vendors)).toEqual(NONE);
  });

  it("is pure: the same input gives the same answer and leaves the book untouched", () => {
    const vendors = buildSeedBook().vendors;
    const before = JSON.stringify(vendors);
    const first = matchVendor("Pine", UNKNOWN_PHONE, vendors);
    expect(matchVendor("Pine", UNKNOWN_PHONE, vendors)).toEqual(first);
    expect(JSON.stringify(vendors)).toBe(before);
  });
});

describe("matchVendor by sender (no claimed name)", () => {
  it("an email on file identifies the vendor", () => {
    expect(matchVendor(null, "billing@pixelandpine.example", buildSeedBook().vendors)).toEqual({
      vendorId: "pixel",
      confidence: 0.9,
      method: "sender",
      matchedOn: null,
    });
  });

  it("a phone on file, written another way, identifies the vendor", () => {
    expect(matchVendor(null, "+1 (555) 555-0102", buildSeedBook().vendors)).toEqual({
      vendorId: "northwind",
      confidence: 0.9,
      method: "sender",
      matchedOn: null,
    });
  });

  it("a blank name counts as no name", () => {
    expect(matchVendor("   ", "+15555550102", buildSeedBook().vendors).vendorId).toBe("northwind");
  });

  it("an unknown sender identifies nobody", () => {
    expect(matchVendor(null, UNKNOWN_PHONE, buildSeedBook().vendors)).toEqual(NONE);
  });

  it("a name that matches nobody never falls back to the sender", () => {
    expect(matchVendor("AWS", "+15555550102", buildSeedBook().vendors)).toEqual(NONE);
  });

  it("a known-bad sender identifies nobody, even from an address on file", () => {
    const vendors = buildSeedBook().vendors;
    vendorIn(vendors, "pixel").knownBadSenders = ["billing@pixelandpine.example"];
    expect(matchVendor(null, "billing@pixelandpine.example", vendors)).toEqual(NONE);
  });

  it("a sender on two vendors' files identifies neither", () => {
    const vendors = seedVendorsWith(extraVendor({ id: "twin", name: "Twin Co", phoneOnFile: "+15555550102" }));
    expect(matchVendor(null, "+15555550102", vendors)).toEqual(NONE);
  });
});

describe("matchVendor with ambiguous names", () => {
  const samLee = () => extraVendor({ id: "samlee", name: "Sam Lee", aliases: ["Sam"], phoneOnFile: "+15555550105" });

  it("two vendors sharing an alias match neither", () => {
    expect(matchVendor("Sam", UNKNOWN_PHONE, seedVendorsWith(samLee()))).toEqual(NONE);
  });

  it("the sender's phone on file breaks the tie", () => {
    const vendors = seedVendorsWith(samLee());
    expect(matchVendor("Sam", "+1 555 555 0104", vendors)).toEqual({
      vendorId: "sam",
      confidence: 1,
      method: "name",
      matchedOn: "Sam",
    });
    expect(matchVendor("Sam", "+15555550105", vendors).vendorId).toBe("samlee");
  });

  it("a known-bad sender can't break the tie", () => {
    const vendors = seedVendorsWith(samLee());
    vendorIn(vendors, "sam").knownBadSenders = ["+15555550104"];
    expect(matchVendor("Sam", "+15555550104", vendors)).toEqual(NONE);
  });

  it("a runner-up within 0.02 of the best is a tie too, and the pick keeps its own score", () => {
    // "Pine" scores 0.90 on Pixel & Pine and 0.883 on Pine Street Coffee.
    const pineStreet = extraVendor({ id: "pinest", name: "Pine Street Coffee", phoneOnFile: "+15555550106" });
    const vendors = seedVendorsWith(pineStreet);
    expect(matchVendor("Pine", UNKNOWN_PHONE, vendors)).toEqual(NONE);
    expect(matchVendor("Pine", "+15555550106", vendors)).toEqual({
      vendorId: "pinest",
      confidence: 0.88,
      method: "name",
      matchedOn: "Pine Street Coffee",
    });
  });
});

describe("senderMatchesVendor", () => {
  const northwind = vendorIn(buildSeedBook().vendors, "northwind");

  it.each(["+15555550102", "+1 (555) 555-0102", "555-555-0102", "5555550102", "1.555.555.0102"])(
    "the phone on file written as %s matches",
    (from) => {
      expect(senderMatchesVendor(from, northwind)).toBe(true);
    },
  );

  it("another vendor's phone doesn't match", () => {
    expect(senderMatchesVendor("+15555550103", northwind)).toBe(false);
  });

  it.each([
    "invoices@northwindcloud.example",
    "INVOICES@NorthwindCloud.Example",
    "Northwind Billing <Invoices@NorthwindCloud.example>",
  ])("the email on file written as %j matches", (from) => {
    expect(senderMatchesVendor(from, northwind)).toBe(true);
  });

  it.each(["ar@northwindcloud.example", "billing@ap.northwindcloud.example"])(
    "%s is at the vendor's domain or a subdomain of it, so it matches",
    (from) => {
      expect(senderMatchesVendor(from, northwind)).toBe(true);
    },
  );

  it.each([
    "billing@northwindcloud.example.evil.net",
    "billing@evilnorthwindcloud.example",
    "invoices@northwindcl0ud.example",
  ])("lookalike %s doesn't match", (from) => {
    expect(senderMatchesVendor(from, northwind)).toBe(false);
  });

  it("an agent address matches only an address on file, ignoring case and outer spaces", () => {
    // BookVendor has no agent-address field, so a vendor's agent address sits in emailsOnFile.
    const vendor = extraVendor({ id: "agentco", name: "Agent Co", emailsOnFile: ["agent1qvendorbilling0example"] });
    expect(senderMatchesVendor("agent1qvendorbilling0example", vendor)).toBe(true);
    expect(senderMatchesVendor("  AGENT1QVENDORBILLING0EXAMPLE ", vendor)).toBe(true);
    expect(senderMatchesVendor("agent1qvendorbilling0exampl", vendor)).toBe(false);
    expect(senderMatchesVendor("agent1qvendorbilling0example2", vendor)).toBe(false);
  });

  it.each(["", "   ", "+15555550102", "x@y.example", "agent1qxyz"])(
    "a vendor with a blank phone, email and domain never matches %j",
    (from) => {
      const blank = extraVendor({ id: "blank", name: "Blank", phoneOnFile: "", emailsOnFile: [""], domains: [""] });
      expect(senderMatchesVendor(from, blank)).toBe(false);
    },
  );
});

describe("isOwnerAddress", () => {
  it.each([
    ["the owner's phone in another format", "(555) 555-0100", true],
    ["the owner's email in uppercase", "PRIYA@LUMENLABS.EXAMPLE", true],
    ["the owner's email behind a display name", "Priya Raman <priya@lumenlabs.example>", true],
    ["a vendor's phone", "+15555550102", false],
    ["another mailbox at the owner's domain", "billing@lumenlabs.example", false],
    ["the owner's mailbox at a subdomain", "priya@mail.lumenlabs.example", false],
    ["an empty sender", "", false],
  ])("%s -> %s", (_label, from, expected) => {
    expect(isOwnerAddress(from, seedOwner())).toBe(expected);
  });

  it("the OTP phone counts when it differs from the main phone", () => {
    const owner = { ...seedOwner(), otpPhone: "+15555550199" };
    expect(isOwnerAddress("+1 555 555 0199", owner)).toBe(true);
    expect(isOwnerAddress("+15555550100", owner)).toBe(true);
  });

  it("with no owner in the book, nobody is the owner", () => {
    expect(isOwnerAddress("+15555550100", null)).toBe(false);
  });

  it("an owner with blank fields never matches", () => {
    const owner = { ...seedOwner(), phone: "", otpPhone: "", email: "" };
    for (const from of ["", "  ", "+15555550100", "priya@lumenlabs.example"]) {
      expect(isOwnerAddress(from, owner)).toBe(false);
    }
  });
});

describe("isKnownBadSender", () => {
  function withBadList(list: string[]): BookVendor[] {
    const vendors = buildSeedBook().vendors;
    vendorIn(vendors, "pixel").knownBadSenders = list;
    return vendors;
  }

  it("nobody is known-bad when no vendor has a list", () => {
    expect(isKnownBadSender(UNKNOWN_PHONE, buildSeedBook().vendors)).toBe(false);
  });

  it.each([
    ["a listed phone in another format", "5555559001", true],
    ["a listed email in another case, behind a display name", "Pixel Billing <SCAMMER@evil.example>", true],
    ["a listed agent address in another case", " AGENT1QBADACTOR ", true],
    ["a different phone", "+15555559002", false],
    ["another mailbox at the listed email's domain", "billing@evil.example", false],
    ["the listing vendor's own phone on file", "+15555550101", false],
  ])("%s -> %s", (_label, from, expected) => {
    expect(isKnownBadSender(from, withBadList(["+1 (555) 555-9001", "Scammer@Evil.example", "agent1qbadactor"]))).toBe(
      expected,
    );
  });

  it("an empty entry never matches an empty sender", () => {
    expect(isKnownBadSender("", withBadList([""]))).toBe(false);
    expect(isKnownBadSender("  ", withBadList(["  "]))).toBe(false);
  });
});

describe("checkSender", () => {
  it("a sender on the matched vendor's file", () => {
    const book = buildSeedBook();
    expect(checkSender("+15555550102", vendorIn(book.vendors, "northwind"), book)).toEqual({
      isOwner: false,
      knownBad: false,
      onMatchedVendorFile: true,
      onAnyVendorFile: true,
    });
  });

  it("a sender on another vendor's file is on file, but not on the matched vendor's", () => {
    const book = buildSeedBook();
    expect(checkSender("+15555550102", vendorIn(book.vendors, "pixel"), book)).toEqual({
      isOwner: false,
      knownBad: false,
      onMatchedVendorFile: false,
      onAnyVendorFile: true,
    });
  });

  it("with no matched vendor, onMatchedVendorFile is false", () => {
    const book = buildSeedBook();
    expect(checkSender("invoices@northwindcloud.example", null, book)).toEqual({
      isOwner: false,
      knownBad: false,
      onMatchedVendorFile: false,
      onAnyVendorFile: true,
    });
  });

  it("the owner's own phone is the owner and on no vendor's file", () => {
    const book = buildSeedBook();
    expect(checkSender("+1 (555) 555-0100", vendorIn(book.vendors, "northwind"), book)).toEqual({
      isOwner: true,
      knownBad: false,
      onMatchedVendorFile: false,
      onAnyVendorFile: false,
    });
  });

  it("a known-bad address on file is reported as both: knownBad is not folded in", () => {
    const book = buildSeedBook();
    const pixel = vendorIn(book.vendors, "pixel");
    pixel.knownBadSenders = ["billing@pixelandpine.example"];
    expect(checkSender("billing@pixelandpine.example", pixel, book)).toEqual({
      isOwner: false,
      knownBad: true,
      onMatchedVendorFile: true,
      onAnyVendorFile: true,
    });
  });

  it("an unknown sender, in a book with no owner, is none of these", () => {
    const book = { ...buildSeedBook(), owner: null };
    expect(checkSender(UNKNOWN_PHONE, null, book)).toEqual({
      isOwner: false,
      knownBad: false,
      onMatchedVendorFile: false,
      onAnyVendorFile: false,
    });
  });
});

describe("matchVendor with search hits (the Moss seam)", () => {
  it("a hit can lift a vendor over the threshold", () => {
    const hits = [{ vendorId: "northwind", score: 0.92 }];
    expect(matchVendor("NW Cld Svcs", UNKNOWN_PHONE, buildSeedBook().vendors, hits)).toEqual({
      vendorId: "northwind",
      confidence: 0.92,
      method: "name",
      matchedOn: "Northwind Cloud",
    });
  });

  it("a hit never lowers the in-memory score", () => {
    const hits = [{ vendorId: "pixel", score: 0.2 }];
    expect(matchVendor("Pixel & Pine", UNKNOWN_PHONE, buildSeedBook().vendors, hits).confidence).toBe(1);
  });

  it("hits for ids not in the book are ignored", () => {
    expect(matchVendor("AWS", UNKNOWN_PHONE, buildSeedBook().vendors, [{ vendorId: "ghost", score: 0.99 }])).toEqual(NONE);
  });

  it("scores are clamped to 0..1 and non-finite ones dropped", () => {
    const vendors = buildSeedBook().vendors;
    expect(matchVendor("NW Cld Svcs", UNKNOWN_PHONE, vendors, [{ vendorId: "northwind", score: 7 }]).confidence).toBe(1);
    expect(matchVendor("NW Cld Svcs", UNKNOWN_PHONE, vendors, [{ vendorId: "northwind", score: Number.NaN }])).toEqual(NONE);
  });

  it("two vendors lifted to the same score are a tie, and the sender breaks it", () => {
    const hits = [
      { vendorId: "northwind", score: 0.9 },
      { vendorId: "harbor", score: 0.9 },
    ];
    const vendors = buildSeedBook().vendors;
    expect(matchVendor("NW Cld Svcs", UNKNOWN_PHONE, vendors, hits)).toEqual(NONE);
    expect(matchVendor("NW Cld Svcs", "+15555550103", vendors, hits).vendorId).toBe("harbor");
  });

  it("hits never identify a vendor when the request names none", () => {
    expect(matchVendor(null, UNKNOWN_PHONE, buildSeedBook().vendors, [{ vendorId: "northwind", score: 0.99 }])).toEqual(NONE);
  });
});
