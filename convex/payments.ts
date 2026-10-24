// Payment rows and the Increase sandbox setup (owner: P4). runPayer (agents/payer.ts) calls these.
// Destination details are read here from the vendor record, never from the request or a model.
import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { appendAudit } from "./audit";
import { loadInvoice } from "./lib/caseView";
import { increaseRequest, withOneRetry } from "./lib/increase";
import { paymentJournal, type PaymentRail } from "../shared/ledger";
import type { PaymentRequest, PolicyResult } from "../shared/types";

const rail = v.union(v.literal("ach_sandbox"), v.literal("mock"));
const DEFAULT_SANDBOX_FUNDING_CENTS = 250_000_00;

export type PaymentPlan =
  | {
      ok: true;
      paymentId: Id<"payments">;
      rail: PaymentRail;
      amountCents: number;
      idempotencyKey: string;
      invoiceNumber: string;
      bankRouting: string;
      bankLast4: string;
    }
  | { ok: false; error: string };

/**
 * Checks the case is a PAY with a known vendor and an open invoice, refuses a second payment for
 * the same `vendorId:invoiceNumber`, and inserts a pending payment row. All in one transaction.
 */
export const begin = internalMutation({
  args: { caseId: v.id("cases"), rail },
  handler: async (ctx, { caseId, rail }): Promise<PaymentPlan> => {
    const c = await ctx.db.get(caseId);
    if (!c) return { ok: false, error: "Case not found" };
    if ((c.policyResult as PolicyResult | undefined)?.decision !== "PAY") {
      return { ok: false, error: "The Policy Engine did not return PAY" };
    }
    const vendor = c.vendorId ? await ctx.db.get(c.vendorId) : null;
    if (!vendor) return { ok: false, error: "No vendor on file" };
    const invoice = await loadInvoice(ctx, c);
    if (!invoice || invoice.vendorId !== vendor._id) return { ok: false, error: "No matching invoice for this vendor" };
    if (invoice.status !== "open") return { ok: false, error: `Invoice ${invoice.number} is ${invoice.status}` };
    const requested = (c.request as PaymentRequest | undefined)?.amountCents;
    if (requested != null && requested !== invoice.amountCents) {
      return { ok: false, error: "Requested amount differs from the invoice" };
    }

    const idempotencyKey = `${vendor._id}:${invoice.number}`;
    const earlier = await ctx.db
      .query("payments")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
      .collect();
    if (earlier.some((p) => p.status !== "failed")) {
      return { ok: false, error: `Invoice ${invoice.number} already has a payment` };
    }

    const paymentId = await ctx.db.insert("payments", {
      caseId,
      vendorId: vendor._id,
      invoiceId: invoice._id,
      amountCents: invoice.amountCents,
      rail,
      idempotencyKey,
      status: "pending",
      createdAt: Date.now(),
    });
    await appendAudit(ctx, {
      caseId,
      actor: "payer",
      action: "payment.started",
      payload: { rail, amountCents: invoice.amountCents, invoice: invoice.number, toAccountLast4: vendor.bankLast4 },
    });
    return {
      ok: true,
      paymentId,
      rail,
      amountCents: invoice.amountCents,
      idempotencyKey,
      invoiceNumber: invoice.number,
      bankRouting: vendor.bankRouting,
      bankLast4: vendor.bankLast4,
    };
  },
});

export const markSent = internalMutation({
  args: { paymentId: v.id("payments"), externalId: v.string() },
  handler: async (ctx, { paymentId, externalId }) => {
    const payment = await ctx.db.get(paymentId);
    if (!payment) throw new Error(`payment ${paymentId} not found`);
    const now = Date.now();
    await ctx.db.patch(paymentId, { status: "sent", externalId });
    if (payment.invoiceId) await ctx.db.patch(payment.invoiceId, { status: "paid", paidAt: now });
    const vendor = await ctx.db.get(payment.vendorId);
    await appendAudit(ctx, {
      caseId: payment.caseId,
      actor: "payer",
      action: "payment.sent",
      payload: {
        rail: payment.rail,
        externalId,
        amountCents: payment.amountCents,
        journal: paymentJournal({ amountCents: payment.amountCents, vendorName: vendor?.name ?? "vendor", rail: payment.rail }),
      },
    });
  },
});

export const markFailed = internalMutation({
  args: { paymentId: v.id("payments"), error: v.string() },
  handler: async (ctx, { paymentId, error }) => {
    const payment = await ctx.db.get(paymentId);
    if (!payment) throw new Error(`payment ${paymentId} not found`);
    await ctx.db.patch(paymentId, { status: "failed" });
    await appendAudit(ctx, { caseId: payment.caseId, actor: "payer", action: "payment.failed", payload: { rail: payment.rail, error } });
  },
});

type IncreaseList<T> = { data: T[] };
type IncreaseObject = { id: string; status?: string };

/**
 * One-time sandbox setup, run by hand:  npx convex run payments:provisionIncrease
 * Finds (or creates) the paying account and funds it with a simulated inbound wire. Prints the
 * account id to set as INCREASE_ACCOUNT_ID. Safe to re-run.
 */
export const provisionIncrease = internalAction({
  args: { fundCents: v.optional(v.number()) },
  handler: async (_ctx, { fundCents }) => {
    const accounts = await withOneRetry(() => increaseRequest<IncreaseList<IncreaseObject>>("GET", "/accounts"));
    const account = accounts.data.find((a) => a.status === "open") ?? (await createAccount());

    const accountNumber = await withOneRetry(() =>
      increaseRequest<IncreaseObject>("POST", "/account_numbers", {
        body: { account_id: account.id, name: "Countersign sandbox funding" },
        idempotencyKey: `countersign-funding-number-${account.id}`,
      }),
    );
    await withOneRetry(() =>
      increaseRequest<IncreaseObject>("POST", "/simulations/inbound_wire_transfers", {
        body: { account_number_id: accountNumber.id, amount: fundCents ?? DEFAULT_SANDBOX_FUNDING_CENTS },
      }),
    );
    return {
      accountId: account.id,
      next: `npx convex env set INCREASE_ACCOUNT_ID ${account.id}`,
    };
  },
});

async function createAccount(): Promise<IncreaseObject> {
  const [programs, entities] = await Promise.all([
    withOneRetry(() => increaseRequest<IncreaseList<IncreaseObject>>("GET", "/programs")),
    withOneRetry(() => increaseRequest<IncreaseList<IncreaseObject>>("GET", "/entities")),
  ]);
  const program = programs.data[0];
  const entity = entities.data[0];
  if (!program || !entity) {
    throw new Error("The Increase sandbox has no program or entity to open an account with; create one in the dashboard");
  }
  return withOneRetry(() =>
    increaseRequest<IncreaseObject>("POST", "/accounts", {
      body: { name: "Lumen Labs Operating", program_id: program.id, entity_id: entity.id },
      idempotencyKey: `countersign-account-${entity.id}`,
    }),
  );
}
