// Seed world (owner: P3 freezes the data). Spec §7.1. Fictional company and vendors.
// Real phone numbers come from Convex env vars, never from the repo:
//   npx convex env set SEED_OWNER_PHONE +1...   (teammate playing Priya; receives OTPs)
//   npx convex env set SEED_VENDOR_B_PHONE +1... (teammate B playing Pixel & Pine)
// Run: npm run seed   (wipes the seed tables, then inserts)
import { internalMutation } from "./_generated/server";
import { DEMO_POLICY } from "../shared/config";
import { appendAudit } from "./audit";

const TABLES = ["owner", "vendors", "invoices", "cases", "agentRuns", "callbacks", "approvals", "payments"] as const;

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of TABLES) {
      for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
    }

    const ownerPhone = process.env.SEED_OWNER_PHONE ?? "+15555550100";
    const vendorBPhone = process.env.SEED_VENDOR_B_PHONE ?? "+15555550101";

    await ctx.db.insert("owner", {
      name: "Priya Raman",
      company: "Lumen Labs",
      phone: ownerPhone,
      email: "priya@lumenlabs.example",
      otpPhone: ownerPhone,
      policy: DEMO_POLICY,
    });

    const pixel = await ctx.db.insert("vendors", {
      name: "Pixel & Pine Design",
      aliases: ["Pixel and Pine", "Pixel & Pine", "PixelPine"],
      domains: ["pixelandpine.example"],
      phoneOnFile: vendorBPhone,
      emailsOnFile: ["billing@pixelandpine.example"],
      bankLast4: "4417",
      bankRouting: "121000248",
      typicalAmountRange: [4_800_00, 4_800_00],
      cadence: "monthly",
    });
    const northwind = await ctx.db.insert("vendors", {
      name: "Northwind Cloud",
      aliases: ["Northwind", "Northwind Hosting"],
      domains: ["northwindcloud.example"],
      phoneOnFile: "+15555550102",
      emailsOnFile: ["invoices@northwindcloud.example"],
      bankLast4: "2290",
      bankRouting: "026009593",
      typicalAmountRange: [310_00, 420_00],
      cadence: "monthly",
    });
    await ctx.db.insert("vendors", {
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
    });
    const sam = await ctx.db.insert("vendors", {
      name: "Sam Ortiz",
      aliases: ["Sam", "Samuel Ortiz"],
      domains: [],
      phoneOnFile: "+15555550104",
      emailsOnFile: ["sam.ortiz@mail.example"],
      bankLast4: "6634",
      bankRouting: "091000019",
      typicalAmountRange: [1_200_00, 1_200_00],
      cadence: "weekly",
    });

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await ctx.db.insert("invoices", { vendorId: pixel, number: "1042", amountCents: 4_800_00, dueDate: tomorrow, status: "open" });
    await ctx.db.insert("invoices", { vendorId: northwind, number: "NW-889", amountCents: 362_00, dueDate: tomorrow, status: "open" });
    await ctx.db.insert("invoices", { vendorId: sam, number: "W42", amountCents: 1_200_00, dueDate: tomorrow, status: "open" });

    await appendAudit(ctx, { actor: "system", action: "seed.loaded" });
  },
});
