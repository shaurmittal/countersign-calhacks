// The owner's allow and block lists (owner: P3; the /owner page is P4's). Spec §6.5: only the owner changes
// them, with a code from the authenticator app, on /owner. Never over chat, voice or the agent channel,
// because "please add my new number" is exactly what a scammer would send.
//   deny   any hit is R16 BLOCK (sender phone, email or domain; a domain in the message; the bank account)
//   trust  ties one sender to one vendor: senderOnFile, so R3 is satisfied. Nothing else changes, so a
//          trust entry can never move money on its own (shared/verification/lists.ts)
// Every change and every rejected code writes an audit event. What leaves the backend is masked.
import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { appendAudit } from "./audit";
import { maskTail } from "./lib/caseView";
import { listKind, listMatch } from "./schema";
import type { ListMatch } from "../shared/types";
import { checkTotp, describeRejection } from "../shared/totp";
import { normalizeListValue } from "../shared/verification/lists";

const MAX_WRONG_CODES = 5;
const LOCKOUT_MS = 60_000;
const MAX_NOTE_CHARS = 200;
const MAX_EXPIRY_DAYS = 365;
const DAY_MS = 86_400_000;

/** Returned, not thrown: a throw would roll back the wrong-code counter and defeat the lockout. */
export type ListEditResult = { ok: true; message: string } | { ok: false; error: string };

/** What the owner page shows: phones and accounts by their last 4, emails with the name hidden. */
export function maskListValue(match: ListMatch, value: string): string {
  switch (match) {
    case "phone":
      return maskTail(value);
    case "email": {
      const at = value.lastIndexOf("@");
      return at > 0 ? `${value[0]}…@${value.slice(at + 1)}` : maskTail(value);
    }
    case "domain":
      return value;
    case "bank": {
      const [routing, last4] = value.split(":");
      return `routing ${maskTail(routing ?? "")} · account ${maskTail(last4 ?? "")}`;
    }
  }
}

const HOW_TO_TYPE: Record<ListMatch, string> = {
  phone: "Enter a phone number with at least 10 digits, like +1 555 555 0199.",
  email: "Enter an email address, like billing@example.com.",
  domain: "Enter a domain, like pixelandpine-billing.example.",
  bank: "Enter the routing number and the account number (or its last 4), like 021000021 9921.",
};

/** The owner's lists, newest first, plus the senders R10 marked known-bad after a denied callback. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const vendors = await ctx.db.query("vendors").collect();
    const vendorName = new Map(vendors.map((vendor) => [vendor._id as string, vendor.name]));
    const rows = await ctx.db.query("senderLists").collect();
    const entries = rows
      .filter((e) => e.removedAt === undefined)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((e) => ({
        id: e._id,
        kind: e.kind,
        match: e.match,
        value: maskListValue(e.match, e.value),
        vendorName: e.vendorId ? (vendorName.get(e.vendorId) ?? "Removed vendor") : null,
        note: e.note ?? null,
        createdAt: e.createdAt,
        expiresAt: e.expiresAt ?? null,
        expired: e.expiresAt !== undefined && e.expiresAt <= now,
      }));
    // Never on file again (shared/verification/vendorMatch.ts), but not an R16 block: shown, not editable here.
    const knownBad = vendors.flatMap((vendor) =>
      (vendor.knownBadSenders ?? []).map((sender) => ({
        value: sender.includes("@") ? maskListValue("email", sender.toLowerCase()) : maskTail(sender),
        vendorName: vendor.name,
      })),
    );
    return { entries, knownBad };
  },
});

/** Vendor names for the trust form. The vendor book is fictional demo data. */
export const vendors = query({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("vendors").collect()).map((vendor) => ({ id: vendor._id, name: vendor.name })),
});

export const add = mutation({
  args: {
    kind: listKind,
    match: listMatch,
    value: v.string(),
    vendorId: v.optional(v.id("vendors")),
    note: v.optional(v.string()),
    expiresInDays: v.optional(v.number()),
    code: v.string(),
  },
  handler: async (ctx, args): Promise<ListEditResult> => {
    const now = Date.now();
    // Every input is checked before the code, so a typo never costs a code or a wrong-code strike.
    const value = normalizeListValue(args.match, args.value);
    if (value === null) return fail(HOW_TO_TYPE[args.match]);
    let vendor: Doc<"vendors"> | null = null;
    if (args.kind === "trust") {
      if (args.match === "bank") {
        return fail("Bank accounts can only be blocked. A new account still needs a callback and your approval.");
      }
      vendor = args.vendorId ? await ctx.db.get(args.vendorId) : null;
      if (!vendor) return fail("Choose the vendor this sender belongs to.");
    }
    const days = args.expiresInDays;
    if (days !== undefined && !(Number.isFinite(days) && days > 0 && days <= MAX_EXPIRY_DAYS)) {
      return fail(`Expiry must be between 1 and ${MAX_EXPIRY_DAYS} days, or empty for none.`);
    }

    const code = await checkListCode(ctx, args.code, now);
    if (!code.ok) return code;

    const vendorId = vendor?._id;
    const existing = (await ctx.db.query("senderLists").withIndex("by_kind", (q) => q.eq("kind", args.kind)).collect()).find(
      (e) => e.removedAt === undefined && e.match === args.match && e.value === value && e.vendorId === vendorId,
    );
    if (existing) return { ok: true, message: "That entry is already on the list." };

    const note = args.note?.trim().slice(0, MAX_NOTE_CHARS) || undefined;
    const expiresAt = days !== undefined ? now + Math.round(days * DAY_MS) : undefined;
    const entryId = await ctx.db.insert("senderLists", {
      kind: args.kind,
      match: args.match,
      value,
      vendorId,
      note,
      createdAt: now,
      expiresAt,
    });
    const shown = maskListValue(args.match, value);
    await appendAudit(ctx, {
      actor: "owner",
      action: "lists.added",
      payload: { entryId, kind: args.kind, match: args.match, value: shown, vendor: vendor?.name ?? null, expiresAt: expiresAt ?? null },
    });
    return {
      ok: true,
      message:
        args.kind === "deny"
          ? `Blocked ${shown}. Any request from or to it is refused.`
          : `${shown} now counts as on file for ${vendor!.name}. Bank changes still need a callback and your approval.`,
    };
  },
});

export const remove = mutation({
  args: { entryId: v.id("senderLists"), code: v.string() },
  handler: async (ctx, { entryId, code }): Promise<ListEditResult> => {
    const now = Date.now();
    const entry = await ctx.db.get(entryId);
    if (!entry || entry.removedAt !== undefined) return fail("That entry is not on the list.");

    const checked = await checkListCode(ctx, code, now);
    if (!checked.ok) return checked;

    await ctx.db.patch(entryId, { removedAt: now });
    const shown = maskListValue(entry.match, entry.value);
    await appendAudit(ctx, { actor: "owner", action: "lists.removed", payload: { entryId, kind: entry.kind, match: entry.match, value: shown } });
    return { ok: true, message: `Removed ${shown} from the ${entry.kind === "deny" ? "block" : "trust"} list.` };
  },
});

/**
 * The owner's authenticator code for a list edit: the same TOTP check and replay guard as approvals
 * (agents/ownerConcierge.ts), with its own lockout after MAX_WRONG_CODES wrong codes.
 */
async function checkListCode(ctx: MutationCtx, code: string, now: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const owner = await ctx.db.query("owner").first();
  if (!owner) return fail("No owner is set up on this deployment.");
  if (owner.listCodeLockedUntil && owner.listCodeLockedUntil > now) {
    return fail(`Too many wrong codes. Try again in ${Math.ceil((owner.listCodeLockedUntil - now) / 1000)}s.`);
  }
  const secret = process.env.OWNER_TOTP_SECRET;
  if (!secret) return fail("Owner codes are not set up on this deployment (OWNER_TOTP_SECRET).");

  const check = checkTotp({ secretBase32: secret, code, now, lastCounter: owner.lastTotpCounter });
  if (!check.ok) {
    if (check.reason !== "malformed") {
      const attempts = (owner.listCodeAttempts ?? 0) + 1;
      const locked = attempts >= MAX_WRONG_CODES;
      await ctx.db.patch(owner._id, {
        listCodeAttempts: locked ? 0 : attempts,
        listCodeLockedUntil: locked ? now + LOCKOUT_MS : owner.listCodeLockedUntil,
      });
      await appendAudit(ctx, {
        actor: "owner",
        action: "lists.code_rejected",
        payload: { reason: check.reason, attempts, lockedForSeconds: locked ? LOCKOUT_MS / 1000 : 0 },
      });
    }
    return fail(describeRejection(check.reason));
  }
  await ctx.db.patch(owner._id, { lastTotpCounter: check.counter, listCodeAttempts: 0 });
  return { ok: true };
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
