// Vendor-book shapes for the P3 verification logic (owner: P3). Spec §4, §6.2, §6.3.
// Plain data with string ids, so everything in shared/verification/ stays free of Convex imports.
// convex/agents/vendorVerifier.ts (loadVerificationBook) maps Convex docs into these.
import type { Channel, ListKind, ListMatch, PolicyConfig } from "../types";

export type BookVendor = {
  id: string;
  name: string;
  aliases: string[];
  domains: string[];
  phoneOnFile: string;
  emailsOnFile: string[];
  bankLast4: string;
  bankRouting: string;
  crsBusinessId?: string;
  typicalAmountRange: [number, number]; // cents
  cadence: string; // "monthly" | "weekly" | "irregular"
  alwaysEscalate?: boolean;
  knownBadSenders?: string[];
};

export type BookInvoice = {
  id: string;
  vendorId: string;
  number: string;
  amountCents: number;
  dueDate: string; // ISO date
  status: "open" | "paid" | "void";
  paidAt?: number;
};

/** A payment that was sent or is still in flight. The loader leaves failed payments out. */
export type BookPayment = {
  invoiceId: string | null;
  vendorId: string;
  status: "pending" | "sent";
  createdAt: number;
};

export type BookOwner = {
  name: string;
  phone: string;
  otpPhone: string;
  email: string;
  policy: PolicyConfig;
};

/** One live entry of the owner's allow or block lists (convex/senderLists.ts). Removed and expired ones never get here. */
export type BookListEntry = {
  id: string;
  kind: ListKind;
  match: ListMatch;
  /** normalizeListValue's form (shared/verification/lists.ts). */
  value: string;
  /** Trust entries only: the vendor this sender belongs to. */
  vendorId?: string;
};

/** Everything both P3 agents read. They run in parallel, so each loads it on its own. */
export type VerificationBook = {
  vendors: BookVendor[];
  invoices: BookInvoice[];
  payments: BookPayment[];
  owner: BookOwner | null;
  /** The owner's allow and block lists. Absent in books built before the lists existed; read as []. */
  lists?: BookListEntry[];
};

/** The parts of a case the Risk Analyst reads besides the parsed request. */
export type CaseInfo = {
  channel: Channel;
  fromAddress: string;
  rawContent: string;
  receivedAt: number; // epoch ms (cases.createdAt)
};

/**
 * A vendor that a search index returned for the claimed name, scored 0..1. This is the seam for the
 * Moss index: hits can lift a vendor's in-memory name score, never lower it.
 */
export type SearchHit = { vendorId: string; score: number };

/** Which vendor the request refers to. */
export type VendorMatch = {
  vendorId: string | null;
  /** 0..1, rounded to 2 decimals; 0 when vendorId is null. */
  confidence: number;
  method: "name" | "sender" | "none";
  /** The vendor name or alias that matched, for the War Room lane; null unless method is "name". */
  matchedOn: string | null;
};

/** Exact checks of cases.fromAddress against the book. */
export type SenderCheck = {
  /** The owner's registered phone, OTP phone or email. */
  isOwner: boolean;
  /** On any vendor's knownBadSenders list. */
  knownBad: boolean;
  /** On the matched vendor's record (phone, email, or email domain). False when no vendor matched. */
  onMatchedVendorFile: boolean;
  /** On any vendor's record. */
  onAnyVendorFile: boolean;
  /** The sender's phone, email or email domain is on the owner's deny list. */
  ownerDenied?: boolean;
  /** The owner's trust list ties the sender to the matched vendor. False when no vendor matched. */
  trustedByOwner?: boolean;
};

export type InvoiceMatch = {
  /** An open, unpaid invoice of the matched vendor that fits the request. */
  matchingInvoiceId: string | null;
  /** Set when the request points at an invoice that is already paid or has a payment in flight. */
  alreadyPaidAt: number | null;
};
