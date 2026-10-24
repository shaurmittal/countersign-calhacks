// Vendor Verifier (owner: P3). Spec §6.2.
// Matches the claimed vendor against the vendor book, compares the sender and bank details with
// the record, and finds the open invoice: shared/verification/verifyVendor.ts. Actions can't read
// ctx.db, so the book comes from loadVerificationBook. The Risk Analyst loads it too, because the
// two agents run in parallel.
// CRS (KYB + OFAC) isn't wired yet, so crs stays "not_checked" and ofacHit: false means OFAC did
// not run. Never guess: once CRS is wired, an error or timeout must return crs "unavailable".
import { internalQuery, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { PaymentRequest, VendorFindings } from "../../shared/types";
import type { BookVendor, VerificationBook } from "../../shared/verification/types";
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

export async function runVendorVerifier(
  ctx: ActionCtx,
  c: Doc<"cases">,
  request: PaymentRequest,
): Promise<VendorFindings> {
  const book: VerificationBook = await ctx.runQuery(internal.agents.vendorVerifier.loadVerificationBook, {});
  // TODO(P3): Moss (MOSS_PROJECT_ID, MOSS_API_KEY). @moss-js/moss ships native binaries, so the search
  // runs in its own "use node" action (node.externalPackages in convex.json); pass its hits as
  // searchHits here and in runRiskAnalyst. Until then verifyVendor matches in memory.
  //
  // TODO(P3): CRS sandbox (CRS_USERNAME, CRS_PASSWORD, CRS_BASE_URL; POST /users/login for a Bearer
  // token): business lookup on the vendor's crsBusinessId and OFAC on any new beneficiary. Any error
  // or timeout returns crs: { status: "unavailable" }, never "ok".
  return verifyVendor({ request, fromAddress: c.fromAddress, book });
}
