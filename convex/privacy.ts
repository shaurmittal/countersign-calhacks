// Privacy (owner: P2). Spec §8.5: judges' phone numbers are shown as their last 4 digits and the
// full numbers are deleted after the event. Run once judging is over:
//   npx convex run privacy:purgeCallerNumbers
// Replaces every stored caller phone number with "…1234". Web senders are random IDs, not people,
// and audit payloads only ever hold last-4s, so neither needs touching.
import { internalMutation } from "./_generated/server";
import { appendAudit } from "./audit";

const PHONE = /^\+?\d[\d\s().-]{6,}$/;
const mask = (s: string) => (PHONE.test(s) ? `…${s.replace(/\D/g, "").slice(-4)}` : s);

export const purgeCallerNumbers = internalMutation({
  args: {},
  handler: async (ctx) => {
    let cases = 0;
    for (const c of await ctx.db.query("cases").collect()) {
      const masked = mask(c.fromAddress);
      if (masked !== c.fromAddress) {
        await ctx.db.patch(c._id, { fromAddress: masked });
        cases++;
      }
    }
    let vendors = 0;
    for (const vendor of await ctx.db.query("vendors").collect()) {
      const known = vendor.knownBadSenders ?? [];
      const masked = known.map(mask);
      if (masked.some((m, i) => m !== known[i])) {
        await ctx.db.patch(vendor._id, { knownBadSenders: masked });
        vendors++;
      }
    }
    await appendAudit(ctx, { actor: "system", action: "privacy.caller_numbers_purged", payload: { cases, vendors } });
    return { cases, vendors };
  },
});
