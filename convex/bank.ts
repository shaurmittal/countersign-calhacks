// Lumen Bank (owner: P1). A sandbox bank inside the Convex app with its own tables, its own payee file
// and its own boundary: it moves money only for a transfer countersigned by the Policy Engine's PAY
// (convex/lib/countersign.ts), checked against LUMEN_BANK_VERIFY_KEY. The checks are pure
// (shared/bank/verify.ts); this file looks things up, applies the verdict in one transaction, and records
// every attempt, accepted or rejected.
//
// Doors in:  internal.bank.transfer (the Payer)   ·   POST /bank/transfers (anyone, e.g. a hijacked agent)
// Same checks for both. Honesty: the bank and the signer share one deployment here; in production the
// bank holds only the public key and the signer runs in its own isolated service.
import { v } from "convex/values";
import { httpAction, internalMutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { appendAudit } from "./audit";
import { jwkFromEnv, parsePayload, sha256Hex } from "../shared/bank/payload";
import { evaluateTransfer } from "../shared/bank/verify";

export const OPENING_BALANCE_CENTS = 250_000_00;
const ACCOUNT_NAME = "Lumen Labs · Operating";
/** The public door records at most this many rejected attempts a minute, so nobody can flood the ledger. */
const PUBLIC_REJECTS_PER_MINUTE = 30;

const source = v.union(v.literal("countersign"), v.literal("unsigned_api"));

export type TransferResult =
  | { status: "accepted"; transferId: Id<"bankTransfers">; signatureHash: string; balanceCents: number }
  | { status: "rejected"; code: string; reason: string; transferId: Id<"bankTransfers"> | null };

/** Creates the operating account and one payee per vendor if they're missing. Never deletes or resets. */
export async function ensureBankSeeded(ctx: MutationCtx): Promise<{ accountCreated: boolean; payeesCreated: number }> {
  const now = Date.now();
  let accountCreated = false;
  if (!(await ctx.db.query("bankAccounts").first())) {
    await ctx.db.insert("bankAccounts", { name: ACCOUNT_NAME, balanceCents: OPENING_BALANCE_CENTS });
    accountCreated = true;
  }
  let payeesCreated = 0;
  for (const vendor of await ctx.db.query("vendors").collect()) {
    const existing = await ctx.db.query("bankPayees").withIndex("by_vendor", (q) => q.eq("vendorId", vendor._id)).first();
    if (existing) continue;
    await ctx.db.insert("bankPayees", {
      vendorId: vendor._id,
      name: vendor.name,
      routing: vendor.bankRouting,
      accountLast4: vendor.bankLast4,
      status: "active",
      updatedAt: now,
    });
    payeesCreated++;
  }
  return { accountCreated, payeesCreated };
}

/** npx convex run bank:ensureSeeded   (safe on any deployment, including the demo one) */
export const ensureSeeded = internalMutation({ args: {}, handler: (ctx) => ensureBankSeeded(ctx) });

async function payeeFor(ctx: MutationCtx, vendorId: string): Promise<Doc<"bankPayees"> | null> {
  const id = ctx.db.normalizeId("vendors", vendorId);
  if (!id) return null;
  return ctx.db.query("bankPayees").withIndex("by_vendor", (q) => q.eq("vendorId", id)).first();
}

async function transferImpl(
  ctx: MutationCtx,
  args: { payload: unknown; signature?: string; source: "countersign" | "unsigned_api" },
): Promise<TransferResult> {
  const now = Date.now();
  const parsed = parsePayload(args.payload);
  const account = await ctx.db.query("bankAccounts").first();
  const payee = parsed ? await payeeFor(ctx, parsed.vendorId) : null;
  const nonceUsed = parsed
    ? !!(await ctx.db.query("bankNonces").withIndex("by_nonce", (q) => q.eq("nonce", parsed.nonce)).first())
    : false;

  const verdict = await evaluateTransfer(args.payload, args.signature, {
    verifyKey: jwkFromEnv(process.env.LUMEN_BANK_VERIFY_KEY),
    now,
    nonceUsed,
    payee: payee && { routing: payee.routing, accountLast4: payee.accountLast4, status: payee.status },
    balanceCents: account?.balanceCents ?? null,
  });
  if (verdict.consumeNonce && parsed) await ctx.db.insert("bankNonces", { nonce: parsed.nonce, usedAt: now });

  const caseId = parsed ? ctx.db.normalizeId("cases", parsed.caseId) : null;
  const caseExists = caseId ? !!(await ctx.db.get(caseId)) : false;
  const signatureHash = args.signature ? await sha256Hex(args.signature) : undefined;
  const common = {
    payeeId: payee?._id,
    payeeName: payee?.name ?? "Unknown payee",
    amountCents: parsed?.amountCents,
    memo: parsed ? `Invoice ${parsed.invoiceNumber}` : undefined,
    signatureHash,
    caseId: caseExists ? caseId! : undefined,
    source: args.source,
    createdAt: now,
  };

  if (!verdict.ok) {
    const transferId = await ctx.db.insert("bankTransfers", {
      ...common,
      status: "rejected",
      rejectCode: verdict.code,
      rejectReason: verdict.reason,
      // Keep what was presented only when it was genuine, so /bank can show it; forgeries aren't stored.
      ...(verdict.code !== "no_signature" && verdict.code !== "malformed" && verdict.code !== "bad_signature" && { payload: args.payload }),
    });
    if (caseExists) {
      await appendAudit(ctx, {
        caseId: caseId!,
        actor: "bank",
        action: "bank.transfer.rejected",
        payload: { code: verdict.code, reason: verdict.reason, source: args.source, sig: signatureHash?.slice(0, 12) ?? null },
      });
    }
    return { status: "rejected", code: verdict.code, reason: verdict.reason, transferId };
  }

  const balanceCents = account!.balanceCents - verdict.payload.amountCents;
  await ctx.db.patch(account!._id, { balanceCents });
  const transferId = await ctx.db.insert("bankTransfers", {
    ...common,
    status: "accepted",
    payload: verdict.payload,
    signature: args.signature,
  });
  if (caseExists) {
    await appendAudit(ctx, {
      caseId: caseId!,
      actor: "bank",
      action: "bank.transfer.accepted",
      payload: { amountCents: verdict.payload.amountCents, toLast4: verdict.payload.last4, sig: signatureHash!.slice(0, 12), source: args.source },
    });
  }
  return { status: "accepted", transferId, signatureHash: signatureHash!, balanceCents };
}

/** The bank's boundary. The Payer calls it with a countersigned release; POST /bank/transfers calls it too. */
export const transfer = internalMutation({
  args: { payload: v.any(), signature: v.optional(v.string()), source },
  handler: async (ctx, args): Promise<TransferResult | { status: "rate_limited" }> => {
    if (args.source === "unsigned_api") {
      const recent = await ctx.db
        .query("bankTransfers")
        .withIndex("by_source", (q) => q.eq("source", "unsigned_api").gt("createdAt", Date.now() - 60_000))
        .take(PUBLIC_REJECTS_PER_MINUTE);
      if (recent.length >= PUBLIC_REJECTS_PER_MINUTE) return { status: "rate_limited" };
    }
    return transferImpl(ctx, args);
  },
});

// ---- POST /bank/transfers: the public door, the one a hijacked agent would use ----

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export const transferHttp = httpAction(async (ctx, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: "rejected", reason: "Body must be JSON: { payload, signature }" }, { status: 400, headers: CORS });
  }
  const { payload, signature } = (body ?? {}) as { payload?: unknown; signature?: unknown };
  const result = await ctx.runMutation(internal.bank.transfer, {
    payload: payload ?? null,
    signature: typeof signature === "string" && signature.length > 0 ? signature.slice(0, 512) : undefined,
    source: "unsigned_api",
  });
  if (result.status === "rate_limited") {
    return Response.json({ status: "rejected", reason: "Too many attempts; try again in a minute" }, { status: 429, headers: CORS });
  }
  return Response.json(
    result.status === "accepted"
      ? { status: "accepted", signatureHash: result.signatureHash }
      : { status: "rejected", code: result.code, reason: result.reason },
    { headers: CORS },
  );
});

export const transferOptions = httpAction(async () => new Response(null, { status: 204, headers: CORS }));

// ---- /bank page ----

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const account = await ctx.db.query("bankAccounts").first();
    const payees = await ctx.db.query("bankPayees").collect();
    const vendors = new Set((await ctx.db.query("vendors").collect()).map((v) => v._id));
    const transfers = await ctx.db.query("bankTransfers").withIndex("by_createdAt").order("desc").take(30);
    return {
      account: account && { name: account.name, balanceCents: account.balanceCents },
      // Only payees for the current vendor book (a reseeded dev deployment leaves old ones behind).
      payees: payees
        .filter((p) => vendors.has(p.vendorId))
        .map((p) => ({ _id: p._id, name: p.name, accountLast4: p.accountLast4, status: p.status, note: p.note ?? null, pendingLast4: p.pendingChange?.accountLast4 ?? null })),
      transfers: transfers.map((t) => ({
        _id: t._id,
        payeeName: t.payeeName,
        amountCents: t.amountCents ?? null,
        memo: t.memo ?? null,
        status: t.status,
        reason: t.rejectReason ?? null,
        sig: t.signatureHash?.slice(0, 8) ?? null,
        source: t.source,
        createdAt: t.createdAt,
      })),
    };
  },
});

/**
 * One real countersigned release, for /bank's replay attempts. Public on purpose: a used countersignature
 * is worthless (its nonce is spent), and changing a single field breaks the signature.
 */
export const replaySample = query({
  args: {},
  handler: async (ctx) => {
    const t = await ctx.db
      .query("bankTransfers")
      .withIndex("by_status", (q) => q.eq("status", "accepted"))
      .order("desc")
      .first();
    return t?.payload && t.signature ? { payload: t.payload, signature: t.signature, amountCents: t.amountCents ?? null, payeeName: t.payeeName } : null;
  },
});

