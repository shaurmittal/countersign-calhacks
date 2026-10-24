// Seed world (owner: P3 freezes the data). Spec §7.1. Fictional company and vendors.
// The data itself lives in shared/seedWorld.ts so the tests run against the same world.
// Real phone numbers come from Convex env vars, never from the repo:
//   npx convex env set SEED_OWNER_PHONE +1...   (teammate playing Priya; receives OTPs)
//   npx convex env set SEED_VENDOR_B_PHONE +1... (teammate B playing Pixel & Pine)
// Run: npm run seed   (wipes the seed tables, then inserts)
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEMO_POLICY } from "../shared/config";
import {
  SEED_INVOICES,
  SEED_OWNER,
  SEED_VENDOR_B_PHONE,
  SEED_VENDORS,
  seedDueDate,
  type SeedVendorKey,
} from "../shared/seedWorld";
import { appendAudit } from "./audit";

const TABLES = ["owner", "vendors", "invoices", "cases", "agentRuns", "callbacks", "approvals", "payments"] as const;

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of TABLES) {
      for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
    }

    const ownerPhone = process.env.SEED_OWNER_PHONE ?? SEED_OWNER.phone;
    const vendorBPhone = process.env.SEED_VENDOR_B_PHONE ?? SEED_VENDOR_B_PHONE;

    await ctx.db.insert("owner", {
      name: SEED_OWNER.name,
      company: SEED_OWNER.company,
      phone: ownerPhone,
      email: SEED_OWNER.email,
      otpPhone: ownerPhone,
      policy: DEMO_POLICY,
    });

    const vendorIds = {} as Record<SeedVendorKey, Id<"vendors">>;
    for (const key of Object.keys(SEED_VENDORS) as SeedVendorKey[]) {
      const vendor = SEED_VENDORS[key];
      // Pixel & Pine's phone on file is teammate B's, who answers the demo callback.
      vendorIds[key] = await ctx.db.insert("vendors", key === "pixel" ? { ...vendor, phoneOnFile: vendorBPhone } : vendor);
    }

    const dueDate = seedDueDate(Date.now());
    for (const inv of SEED_INVOICES) {
      await ctx.db.insert("invoices", {
        vendorId: vendorIds[inv.vendor],
        number: inv.number,
        amountCents: inv.amountCents,
        dueDate,
        status: "open",
      });
    }

    // The Moss vendor index holds vendor ids, which change on every seed; the policy index is built
    // alongside it. Both are no-ops when Moss isn't set up.
    await ctx.scheduler.runAfter(0, internal.agents.moss.syncVendorIndex, {});
    await ctx.scheduler.runAfter(0, internal.agents.moss.syncPolicyIndex, {});

    await appendAudit(ctx, { actor: "system", action: "seed.loaded" });
  },
});
