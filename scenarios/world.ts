// The seed world (convex/seed.ts) as plain data, plus a small reference Vendor Verifier and
// Risk Analyst so the scenario set runs in CI without Convex, Moss or CRS.
// The real agents (P3) are richer; this is only the minimum the Policy Engine needs, and it
// doubles as the spec for what VendorFindings should contain.
import type { InvoiceRecord, PaymentRequest, RiskFindings, RiskFlag, VendorFindings, VendorRecord } from "../shared/types";

export type WorldVendor = VendorRecord & {
  aliases: string[];
  phoneOnFile: string;
  emailsOnFile: string[];
  bankLast4: string;
  bankRouting: string;
};
export type WorldInvoice = InvoiceRecord & { vendorId: string };

export const OWNER_PHONE = "+15555550100";

export const VENDORS: WorldVendor[] = [
  {
    id: "v_pixel",
    name: "Pixel & Pine Design",
    aliases: ["Pixel and Pine", "Pixel & Pine", "PixelPine"],
    phoneOnFile: "+15555550101",
    emailsOnFile: ["billing@pixelandpine.example"],
    bankLast4: "4417",
    bankRouting: "121000248",
    typicalAmountRange: [4_800_00, 4_800_00],
  },
  {
    id: "v_northwind",
    name: "Northwind Cloud",
    aliases: ["Northwind", "Northwind Hosting"],
    phoneOnFile: "+15555550102",
    emailsOnFile: ["invoices@northwindcloud.example"],
    bankLast4: "2290",
    bankRouting: "026009593",
    typicalAmountRange: [310_00, 420_00],
  },
  {
    id: "v_harbor",
    name: "Harbor Legal",
    aliases: ["Harbor Legal LLP", "Harbor Law"],
    phoneOnFile: "+15555550103",
    emailsOnFile: ["accounts@harborlegal.example"],
    bankLast4: "8812",
    bankRouting: "322271627",
    typicalAmountRange: [500_00, 15_000_00],
    alwaysEscalate: true,
  },
  {
    id: "v_sam",
    name: "Sam Ortiz",
    aliases: ["Sam", "Samuel Ortiz"],
    phoneOnFile: "+15555550104",
    emailsOnFile: ["sam.ortiz@mail.example"],
    bankLast4: "6634",
    bankRouting: "091000019",
    typicalAmountRange: [1_200_00, 1_200_00],
  },
];

export const INVOICES: WorldInvoice[] = [
  { id: "i_1042", vendorId: "v_pixel", number: "1042", amountCents: 4_800_00, status: "open", paidAt: null },
  { id: "i_nw889", vendorId: "v_northwind", number: "NW-889", amountCents: 362_00, status: "open", paidAt: null },
  { id: "i_w42", vendorId: "v_sam", number: "W42", amountCents: 1_200_00, status: "open", paidAt: null },
  { id: "i_hl2210", vendorId: "v_harbor", number: "HL-2210", amountCents: 1_500_00, status: "open", paidAt: null },
];

/** Per-scenario changes to the world that a message alone can't express. */
export type WorldOverrides = {
  paidInvoices?: string[]; // invoice numbers already paid
  ofacHit?: boolean;
  crs?: "ok" | "unavailable" | "not_checked";
};

function norm(s: string): string {
  return s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchVendor(name: string | null): WorldVendor | null {
  if (!name) return null;
  const n = norm(name);
  return VENDORS.find((v) => [v.name, ...v.aliases].some((a) => norm(a) === n || n.startsWith(`${norm(a)} `))) ?? null;
}

export function referenceFindings(
  req: PaymentRequest,
  from: string,
  w: WorldOverrides = {},
): { vendor: WorldVendor | null; findings: VendorFindings; invoice: InvoiceRecord | null } {
  const invoices = INVOICES.map((i) =>
    w.paidInvoices?.includes(i.number) ? { ...i, status: "paid" as const, paidAt: Date.UTC(2026, 9, 1) } : i,
  );
  const vendor = matchVendor(req.claimedVendorName);
  const mine = vendor ? invoices.filter((i) => i.vendorId === vendor.id) : [];

  let invoice: WorldInvoice | null = null;
  if (req.invoiceNumber) {
    invoice = mine.find((i) => norm(i.number) === norm(req.invoiceNumber!)) ?? null;
  } else {
    const open = mine.filter((i) => i.status === "open" && (req.amountCents == null || i.amountCents === req.amountCents));
    invoice = open.length === 1 ? open[0] : null;
  }
  const matches = invoice && invoice.status === "open" && (req.amountCents == null || req.amountCents === invoice.amountCents);

  const bank = req.newBankDetails;
  const bankMatches =
    !vendor || !bank
      ? null
      : (!bank.account || bank.account.endsWith(vendor.bankLast4)) && (!bank.routing || bank.routing === vendor.bankRouting);

  return {
    vendor,
    invoice,
    findings: {
      vendorId: vendor?.id ?? null,
      matchConfidence: vendor ? 0.95 : 0,
      senderOnFile: !!vendor && (vendor.phoneOnFile === from || vendor.emailsOnFile.includes(from)),
      bankMatches,
      crs: { status: w.crs ?? "not_checked" },
      ofacHit: !!w.ofacHit,
      matchingInvoiceId: matches ? invoice!.id : null,
      alreadyPaidAt: invoice?.status === "paid" ? invoice.paidAt : null,
    },
  };
}

export function referenceRisk(req: PaymentRequest): RiskFindings {
  const flags: RiskFlag[] = [];
  if (req.newBankDetails || req.requestedAction === "change_bank" || req.requestedAction === "update_payroll") flags.push("bank_change");
  if (req.urgencyClaims.length) flags.push("urgency");
  if (req.requestedAction === "gift_cards" || req.requestedAction === "crypto") flags.push("forbidden_rail");
  if (req.claimedSenderRole === "owner") flags.push("owner_impersonation");
  if (req.injectionAttempt) flags.push("injection_attempt");
  return { riskScore: Math.min(100, flags.length * 25), flags, explanation: "" };
}
