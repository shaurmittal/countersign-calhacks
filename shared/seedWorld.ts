// Seed world data (owner: P3 freezes it). Spec §7.1. Fictional company, vendors and invoices.
// convex/seed.ts inserts exactly this, and tests use buildSeedBook() to run against the same world.
// Real demo phone numbers come from Convex env vars at seed time, never from the repo.
import { DEMO_POLICY } from "./config";
import type { BookInvoice, BookVendor, VerificationBook } from "./verification/types";

export const SEED_OWNER = {
  name: "Priya Raman",
  company: "Lumen Labs",
  email: "priya@lumenlabs.example",
  /** Used when SEED_OWNER_PHONE is unset. scenarios.json sends the owner's own requests from it. */
  phone: "+15555550100",
};

/** Pixel & Pine's phone on file when SEED_VENDOR_B_PHONE is unset (teammate B plays the vendor). */
export const SEED_VENDOR_B_PHONE = "+15555550101";

export type SeedVendorKey = "pixel" | "northwind" | "harbor" | "sam";

export const SEED_VENDORS: Record<SeedVendorKey, Omit<BookVendor, "id">> = {
  pixel: {
    name: "Pixel & Pine Design",
    aliases: ["Pixel and Pine", "Pixel & Pine", "PixelPine"],
    domains: ["pixelandpine.example"],
    phoneOnFile: SEED_VENDOR_B_PHONE,
    emailsOnFile: ["billing@pixelandpine.example"],
    bankLast4: "4417",
    bankRouting: "121000248",
    typicalAmountRange: [4_800_00, 4_800_00],
    cadence: "monthly",
  },
  northwind: {
    name: "Northwind Cloud",
    aliases: ["Northwind", "Northwind Hosting"],
    domains: ["northwindcloud.example"],
    phoneOnFile: "+15555550102",
    emailsOnFile: ["invoices@northwindcloud.example"],
    bankLast4: "2290",
    bankRouting: "026009593",
    typicalAmountRange: [310_00, 420_00],
    cadence: "monthly",
  },
  harbor: {
    name: "Harbor Legal",
    aliases: ["Harbor Legal LLP", "Harbor Law"],
    domains: ["harborlegal.example"],
    phoneOnFile: "+15555550103",
    emailsOnFile: ["accounts@harborlegal.example"],
    bankLast4: "8812",
    bankRouting: "322271627",
    typicalAmountRange: [500_00, 15_000_00],
    cadence: "irregular",
    alwaysEscalate: true,
  },
  sam: {
    name: "Sam Ortiz",
    aliases: ["Sam", "Samuel Ortiz"],
    domains: [],
    phoneOnFile: "+15555550104",
    emailsOnFile: ["sam.ortiz@mail.example"],
    bankLast4: "6634",
    bankRouting: "091000019",
    typicalAmountRange: [1_200_00, 1_200_00],
    cadence: "weekly",
  },
};

/**
 * Open invoices (spec §7.1), all due the day after seeding. Mirrors scenarios/world.ts (P1), so the
 * answer key and the live seed agree.
 */
export const SEED_INVOICES: { vendor: SeedVendorKey; number: string; amountCents: number }[] = [
  { vendor: "pixel", number: "1042", amountCents: 4_800_00 },
  { vendor: "northwind", number: "NW-889", amountCents: 362_00 },
  { vendor: "sam", number: "W42", amountCents: 1_200_00 },
  { vendor: "harbor", number: "HL-2210", amountCents: 1_500_00 },
];

/** ISO date one day after `now`. */
export function seedDueDate(now: number): string {
  return new Date(now + 86_400_000).toISOString().slice(0, 10);
}

/**
 * The seed world as a VerificationBook, for tests. Vendor ids are their keys ("pixel", "northwind",
 * "harbor", "sam") and invoice ids are "inv-<number>" ("inv-NW-889"). Every call returns fresh
 * objects, so a test can edit its copy freely.
 */
export function buildSeedBook(now = Date.UTC(2026, 9, 24, 18)): VerificationBook {
  const vendors: BookVendor[] = (Object.keys(SEED_VENDORS) as SeedVendorKey[]).map((key) => {
    const v = SEED_VENDORS[key];
    return {
      ...v,
      id: key,
      aliases: [...v.aliases],
      domains: [...v.domains],
      emailsOnFile: [...v.emailsOnFile],
      typicalAmountRange: [v.typicalAmountRange[0], v.typicalAmountRange[1]],
    };
  });
  const invoices: BookInvoice[] = SEED_INVOICES.map((inv) => ({
    id: `inv-${inv.number}`,
    vendorId: inv.vendor,
    number: inv.number,
    amountCents: inv.amountCents,
    dueDate: seedDueDate(now),
    status: "open",
  }));
  return {
    vendors,
    invoices,
    payments: [],
    owner: {
      name: SEED_OWNER.name,
      phone: SEED_OWNER.phone,
      otpPhone: SEED_OWNER.phone,
      email: SEED_OWNER.email,
      policy: { ...DEMO_POLICY },
    },
  };
}
