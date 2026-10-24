// Read helpers shared by the War Room, the owner page and the agent bridge (owner: P4).
// Everything that leaves the backend through these is masked: phone numbers and account
// numbers show their last 4 only, and approval rows never include the code hash.
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { PaymentRequest, PolicyResult, VendorFindings } from "../../shared/types";

type DbReader = { db: QueryCtx["db"] };

export function maskTail(value: string, keep = 4): string {
  return `…${value.slice(-keep)}`;
}

/** Short case reference the owner types in ASI:One ("approve 3kx9q2 123456"). */
export function caseRef(caseId: string): string {
  return caseId.slice(-6);
}

export async function loadInvoice(ctx: DbReader, c: Doc<"cases">): Promise<Doc<"invoices"> | null> {
  const invoiceId = (c.vendorFindings as VendorFindings | undefined)?.matchingInvoiceId;
  const normalized = invoiceId ? ctx.db.normalizeId("invoices", invoiceId) : null;
  return normalized ? ctx.db.get(normalized) : null;
}

export type CaseSummary = {
  vendorName: string | null;
  vendorOnFile: boolean;
  amountCents: number | null;
  invoiceNumber: string | null;
  firedRules: string[];
  reasons: string[];
  overridable: boolean;
  coolingOffSeconds: number;
};

/** What the case is about, from the vendor record when matched, else from what the requester claimed. */
export async function summarizeCase(ctx: DbReader, c: Doc<"cases">): Promise<CaseSummary> {
  const request = c.request as PaymentRequest | undefined;
  const policy = c.policyResult as PolicyResult | undefined;
  const vendor = c.vendorId ? await ctx.db.get(c.vendorId) : null;
  const invoice = await loadInvoice(ctx, c);
  return {
    vendorName: vendor?.name ?? request?.claimedVendorName ?? null,
    vendorOnFile: !!vendor,
    amountCents: request?.amountCents ?? invoice?.amountCents ?? null,
    invoiceNumber: invoice?.number ?? request?.invoiceNumber ?? null,
    firedRules: policy?.firedRules ?? [],
    reasons: policy?.reasons ?? [],
    overridable: policy?.overridable ?? true,
    coolingOffSeconds: policy?.needs.coolingOffSeconds ?? 0,
  };
}

export function publicApproval(a: Doc<"approvals">) {
  const { otpHash, ...rest } = a;
  void otpHash;
  return rest;
}

export async function latestApproval(ctx: DbReader, caseId: Doc<"cases">["_id"]): Promise<Doc<"approvals"> | null> {
  return ctx.db
    .query("approvals")
    .withIndex("by_case", (q) => q.eq("caseId", caseId))
    .order("desc")
    .first();
}
