import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSeedBook } from "../seedWorld";
import {
  MOSS_MIN_SCORE,
  deploymentSlug,
  scopeFilter,
  toSearchHits,
  vendorIdFromDocId,
  vendorScope,
  vendorSearchDocs,
  withTimeout,
} from "./moss";
import { matchVendor } from "./vendorMatch";

describe("deploymentSlug", () => {
  it.each([
    ["https://handsome-dove-614.convex.cloud", "handsome-dove-614"],
    ["https://Odd_Name.convex.cloud", "odd-name"],
    [undefined, "default"],
    ["not a url", "default"],
  ])("%s -> %s", (url, expected) => {
    expect(deploymentSlug(url)).toBe(expected);
  });
});

describe("scopes", () => {
  it("give each deployment its own vendor scope, filtered by equality", () => {
    expect(vendorScope("handsome-dove-614")).toBe("vendor:handsome-dove-614");
    expect(scopeFilter("vendor:handsome-dove-614")).toEqual({ field: "scope", condition: { $eq: "vendor:handsome-dove-614" } });
  });
});

describe("vendorSearchDocs", () => {
  const docs = vendorSearchDocs(buildSeedBook().vendors, "dove");

  it("writes one document per vendor name and alias, in the deployment's scope", () => {
    expect(docs).toHaveLength(13);
    expect(docs.filter((d) => d.metadata.vendorId === "pixel").map((d) => d.text)).toEqual([
      "Pixel & Pine Design",
      "Pixel and Pine",
      "Pixel & Pine",
      "PixelPine",
    ]);
    expect(docs[0]).toEqual({
      id: "vendor:dove:pixel:0",
      text: "Pixel & Pine Design",
      metadata: { scope: "vendor:dove", vendorId: "pixel", kind: "name" },
    });
    expect(docs[1].metadata.kind).toBe("alias");
    expect(new Set(docs.map((d) => d.metadata.scope))).toEqual(new Set(["vendor:dove"]));
  });

  it("sends Moss's cloud names only: no emails, phones or account numbers", () => {
    for (const doc of docs) {
      expect(doc.text, doc.id).not.toMatch(/@|\d{4,}/);
    }
  });

  it("skips blank aliases", () => {
    const [vendor] = buildSeedBook().vendors;
    vendor.aliases = ["  ", "Pixel and Pine"];
    expect(vendorSearchDocs([vendor], "dove").map((d) => d.id)).toEqual(["vendor:dove:pixel:0", "vendor:dove:pixel:2"]);
  });
});

describe("vendorIdFromDocId", () => {
  it.each([
    ["vendor:dove:pixel:0", "pixel"],
    ["vendor:handsome-dove-614:k178x1qg01xgvs1vmzdfywnd9h8gxpxg:12", "k178x1qg01xgvs1vmzdfywnd9h8gxpxg"],
    ["policy:bank-change", null],
    ["vendor:dove:pixel", null],
    ["vendor::pixel:0", null],
    ["vendor:dove:pixel:x", null],
    ["pixel#0", null],
  ])("%s -> %s", (docId, expected) => {
    expect(vendorIdFromDocId(docId)).toBe(expected);
  });
});

describe("toSearchHits", () => {
  it("keeps each vendor's best score, best first", () => {
    const docs = [
      { id: "vendor:dove:northwind:2", score: 0.86 },
      { id: "vendor:dove:pixel:0", score: 0.9 },
      { id: "vendor:dove:northwind:0", score: 0.97 },
    ];
    expect(toSearchHits(docs, 0)).toEqual([
      { vendorId: "northwind", score: 0.97 },
      { vendorId: "pixel", score: 0.9 },
    ]);
  });

  it("drops scores below the floor, and the floor is adjustable", () => {
    const docs = [{ id: "vendor:dove:sam:0", score: MOSS_MIN_SCORE - 0.01 }];
    expect(toSearchHits(docs)).toEqual([]);
    expect(toSearchHits(docs, 0)).toEqual([{ vendorId: "sam", score: MOSS_MIN_SCORE - 0.01 }]);
  });

  it("clamps scores to 0..1 and ignores non-finite scores and policy sentences", () => {
    const docs = [
      { id: "vendor:dove:pixel:0", score: 1.7 },
      { id: "vendor:dove:harbor:0", score: Number.NaN },
      { id: "policy:callback", score: 0.99 },
    ];
    expect(toSearchHits(docs, 0)).toEqual([{ vendorId: "pixel", score: 1 }]);
  });
});

describe("withTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the value when it arrives in time", async () => {
    await expect(withTimeout(Promise.resolve([1]), 1_000, [])).resolves.toEqual([1]);
  });

  it("returns the fallback when the promise rejects", async () => {
    await expect(withTimeout(Promise.reject(new Error("moss down")), 1_000, [])).resolves.toEqual([]);
  });

  it("returns the fallback once the budget runs out", async () => {
    vi.useFakeTimers();
    const never = new Promise<number[]>(() => {});
    const result = withTimeout(never, 3_000, []);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(result).resolves.toEqual([]);
  });
});

// Scores Moss returned on 2026-10-24 for the seed book (moss-minilm), best vendor per query. They pin
// what the 0.95 floor lets through, together with the in-memory matcher, so a change is a visible choice.
describe("the 0.95 floor on the scores Moss returned for the seed book", () => {
  const vendors = buildSeedBook().vendors;
  const UNKNOWN = "+15555559001";

  it.each<[string, string, number, string | null]>([
    ["NW Cloud", "northwind", 0.967, "northwind"], // an abbreviation only Moss recognizes
    ["Northern Cloud", "northwind", 1, "northwind"], // a near-name the team accepted matching
    ["Pixle and Pine", "pixel", 0.869, "pixel"], // below the floor, but the in-memory match holds
    ["Sam's Club", "sam", 0.867, null],
    ["Pinewood Design", "pixel", 0.879, null],
    ["Harbor Bank", "harbor", 0.828, null],
    ["Harbor Freight", "harbor", 0.735, null],
    ["Google Cloud", "northwind", 0.505, null],
    ["AWS", "northwind", 0.326, null],
  ])("%s (Moss %s %s) -> %s", (query, vendorId, score, expected) => {
    const hits = toSearchHits([{ id: `vendor:test:${vendorId}:0`, score }]);
    expect(matchVendor(query, UNKNOWN, vendors, hits).vendorId).toBe(expected);
  });
});
