// Vendor Verifier (owner: P3). Spec §6.2.
// Matches the claimed vendor against the vendor book, compares the sender and bank details with
// the record, and finds the open invoice: shared/verification/verifyVendor.ts. Actions can't read
// ctx.db, so the book comes from loadVerificationBook. The Risk Analyst loads it too, because the
// two agents run in parallel.
// CRS: AtData Fraud Finder screens the sender's email when the book doesn't know the sender
// (shared/verification/crs.ts). The team's CRS account has no KYB or OFAC product, so ofacHit stays
// false and only means OFAC did not run. Any CRS error or timeout returns crs "unavailable", never "ok".
import { v } from "convex/values";
import { internalAction, internalQuery, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { PaymentRequest, VendorFindings } from "../../shared/types";
import {
  CRS_BUDGET_MS,
  createCrsClient,
  crsConfig,
  crsUnavailable,
  emailToScreen,
  type CrsClient,
  type CrsResult,
} from "../../shared/verification/crs";
import { MOSS_CALLER_TIMEOUT_MS, withTimeout } from "../../shared/verification/moss";
import type { BookVendor, SearchHit, VerificationBook } from "../../shared/verification/types";
import { verifyVendor } from "../../shared/verification/verifyVendor";

function toBookVendor(v: Doc<"vendors">): BookVendor {
  // A missing range reads as [0, 0], so every amount is anomalous rather than silently fine.
  const [min = 0, max = min] = v.typicalAmountRange;
  return {
    id: v._id,
    name: v.name,
    aliases: v.aliases,
    domains: v.domains,
    phoneOnFile: v.phoneOnFile,
    emailsOnFile: v.emailsOnFile,
    bankLast4: v.bankLast4,
    bankRouting: v.bankRouting,
    crsBusinessId: v.crsBusinessId,
    typicalAmountRange: [min, max],
    cadence: v.cadence,
    alwaysEscalate: v.alwaysEscalate,
    knownBadSenders: v.knownBadSenders,
  };
}

/** The vendor book both P3 agents read: vendors, invoices, live payments and the owner. */
export const loadVerificationBook = internalQuery({
  args: {},
  handler: async (ctx): Promise<VerificationBook> => {
    const [vendors, invoices, payments, owner] = await Promise.all([
      ctx.db.query("vendors").collect(),
      ctx.db.query("invoices").collect(),
      ctx.db.query("payments").collect(),
      ctx.db.query("owner").first(),
    ]);
    return {
      vendors: vendors.map(toBookVendor),
      invoices: invoices.map((i) => ({
        id: i._id,
        vendorId: i.vendorId,
        number: i.number,
        amountCents: i.amountCents,
        dueDate: i.dueDate,
        status: i.status,
        paidAt: i.paidAt,
      })),
      // A pending payment counts as paid, so a second request can't pay the same invoice twice.
      payments: payments.flatMap((p) =>
        p.status === "failed"
          ? []
          : [{ invoiceId: p.invoiceId ?? null, vendorId: p.vendorId, status: p.status, createdAt: p.createdAt }],
      ),
      owner: owner && {
        name: owner.name,
        phone: owner.phone,
        otpPhone: owner.otpPhone,
        email: owner.email,
        policy: owner.policy,
      },
    };
  },
});

/**
 * Moss hits for the claimed vendor name (convex/agents/moss.ts runs in Node). [] when the request names
 * no vendor, Moss isn't set up, or it takes too long, so the in-memory match decides. Never throws.
 */
export async function mossHits(ctx: ActionCtx, claimedName: string | null): Promise<SearchHit[]> {
  const query = claimedName?.trim().slice(0, 200) ?? "";
  if (query === "") return [];
  return withTimeout(ctx.runAction(internal.agents.moss.searchVendors, { query }), MOSS_CALLER_TIMEOUT_MS, []);
}

// One CRS client per set of settings, kept while this isolate lives, so cases reuse the token.
let crs: { settings: string; client: CrsClient } | null = null;

/** null when the deployment has no CRS_USERNAME and CRS_PASSWORD, or CRS_BASE_URL isn't the sandbox. */
function crsClient(): CrsClient | null {
  const config = crsConfig(process.env);
  if (!config) return null;
  const settings = JSON.stringify(config);
  if (crs?.settings !== settings) crs = { settings, client: createCrsClient(config, fetch) };
  return crs.client;
}

/**
 * CRS on the sender's email. "not_checked" when the book knows the sender (owner or vendor on file),
 * the sender isn't an email, or CRS isn't set up. Never throws.
 */
async function screenSender(fromAddress: string, book: VerificationBook): Promise<CrsResult> {
  const email = emailToScreen(fromAddress, book);
  const client = email ? crsClient() : null;
  if (!email || !client) return { status: "not_checked" };
  return withTimeout(client.screenEmail(email), CRS_BUDGET_MS, crsUnavailable("timeout"));
}

export async function runVendorVerifier(
  ctx: ActionCtx,
  c: Doc<"cases">,
  request: PaymentRequest,
): Promise<VendorFindings> {
  const hits = mossHits(ctx, request.claimedVendorName);
  const book: VerificationBook = await ctx.runQuery(internal.agents.vendorVerifier.loadVerificationBook, {});
  const [searchHits, crsResult]: [SearchHit[], CrsResult] = await Promise.all([hits, screenSender(c.fromAddress, book)]);
  return { ...verifyVendor({ request, fromAddress: c.fromAddress, book, searchHits }), crs: crsResult };
}

/**
 * One live CRS check from the CLI, for any address (it skips the vendor-book filter). It logs in unless
 * this isolate already holds a token, then makes one Fraud Finder call:
 * npx convex run agents/vendorVerifier:screenEmail '{"email":"invoices@northwind-cloud-billing.example"}'
 */
export const screenEmail = internalAction({
  args: { email: v.string() },
  handler: async (_ctx, { email }): Promise<CrsResult> => {
    const client = crsClient();
    if (!client) return { status: "not_checked" };
    return withTimeout(client.screenEmail(email.trim().toLowerCase()), CRS_BUDGET_MS, crsUnavailable("timeout"));
  },
});
