// Shared contract between every agent, the Policy Engine and the War Room UI.
// Pure TypeScript only: no Convex or Node imports, so it runs in tests, Convex and the browser.
// Change these types in a small PR of its own and tell the team; everyone depends on them.

export type Channel = "web" | "call" | "sms" | "email" | "agent" | "whatsapp";

export type SenderRole =
  | "vendor"
  | "owner"
  | "cofounder"
  | "employee"
  | "government"
  | "unknown";

export type RequestedAction =
  | "pay_invoice"
  | "change_bank"
  | "wire"
  | "gift_cards"
  | "crypto"
  | "update_payroll"
  | "other"
  | "none";

/** Output of the Intake Parser (spec §4). */
export type PaymentRequest = {
  claimedVendorName: string | null;
  claimedSenderRole: SenderRole;
  amountCents: number | null;
  currency: string; // "USD" or other ISO code
  invoiceNumber: string | null;
  newBankDetails: { routing?: string; account?: string } | null;
  urgencyClaims: string[];
  requestedAction: RequestedAction;
  /** Set by the parser when the text tries to instruct the model. */
  injectionAttempt: boolean;
  /** Set when the parser could not produce a valid request (model error, bad JSON). Forces HOLD. */
  parseFailed?: boolean;
  /** The message asks for more than one payment. Each must arrive as its own request; forces HOLD. */
  multipleRequests?: boolean;
};

export type CaseStatus =
  | "RECEIVED"
  | "PARSED"
  | "VERIFYING"
  | "CALLBACK_PENDING"
  | "DECIDED"
  | "AWAITING_OWNER"
  | "CLOSED";

export type Decision = "PAY" | "HOLD" | "BLOCK" | "ESCALATE" | "NO_ACTION";

export type AgentName =
  | "intake"
  | "vendorVerifier"
  | "riskAnalyst"
  | "callback"
  | "policy"
  | "ownerConcierge"
  | "payer";

export type AgentRunStatus = "queued" | "running" | "done" | "failed";

/** Output of the Vendor Verifier (spec §6.2). */
export type VendorFindings = {
  vendorId: string | null;
  matchConfidence: number; // 0..1
  senderOnFile: boolean;
  /** null when the request carries no bank details. */
  bankMatches: boolean | null;
  crs: {
    status: "ok" | "unavailable" | "not_checked";
    businessVerified?: boolean;
    raw?: unknown;
  };
  ofacHit: boolean;
  /** An open invoice that matches the request's number and amount, if any. */
  matchingInvoiceId: string | null;
  /** Set when the matching invoice is already paid (duplicate request). */
  alreadyPaidAt: number | null;
  /** Owner deny-list entries this request hit. R16 blocks on any. Absent on findings from before the lists existed. */
  denyListHits?: DenyListHit[];
  /** senderOnFile is true only because the owner's trust list ties this sender to the vendor. It satisfies R3, nothing else. */
  trustedByOwner?: boolean;
};

/** The owner's allow and block lists (convex/senderLists.ts). Deny only tightens; trust only satisfies R3. */
export type ListKind = "deny" | "trust";
export type ListMatch = "phone" | "email" | "domain" | "bank";

/** One owner deny-list entry a request hit. Never the value itself: public queries return findings unmasked. */
export type DenyListHit = {
  entryId: string;
  match: ListMatch;
  /** Where it matched: the sender's address, a domain written in the message, or the requested bank account. */
  source: "sender" | "message" | "bank";
};

export type RiskFlag =
  | "bank_change"
  | "urgency"
  | "new_sender"
  | "lookalike_domain"
  | "amount_anomaly"
  | "off_hours"
  | "forbidden_rail"
  | "owner_impersonation"
  | "injection_attempt";

/** Output of the Risk Analyst (spec §6.3). The score is for display only and never decides. */
export type RiskFindings = {
  riskScore: number; // 0..100
  flags: RiskFlag[];
  explanation: string; // two sentences, written by Claude
};

export type CallbackOutcome = "confirmed" | "denied" | "no_answer" | "unclear";

export type ApprovalState = {
  method: "otp" | "asi_one";
  approved: boolean;
  /** The owner said no (or cancelled during cooling-off). */
  cancelled?: boolean;
  coolingOffUntil: number | null; // epoch ms
};

/** The invoice the Vendor Verifier matched, loaded by the pipeline from the invoices table. */
export type InvoiceRecord = {
  id: string;
  number: string;
  amountCents: number;
  status: "open" | "paid" | "void";
  paidAt: number | null;
};

export type PolicyConfig = {
  autoPayLimitCents: number;
  coolingOffThresholdCents: number;
  coolingOffSeconds: number;
  amountAnomalyPct: number; // 0.25 = 25%
};

/** Minimal vendor shape the Policy Engine needs. */
export type VendorRecord = {
  id: string;
  name: string;
  typicalAmountRange: [number, number]; // cents
  alwaysEscalate?: boolean;
};

export type RuleId =
  | "R1"
  | "R2"
  | "R3"
  | "R4"
  | "R5"
  | "R6"
  | "R7"
  | "R8"
  | "R9"
  | "R10"
  | "R11"
  | "R12"
  | "R13"
  | "R14"
  | "R15"
  | "R16";

export type PolicyInput = {
  request: PaymentRequest;
  vendor: VendorRecord | null;
  vendorFindings: VendorFindings | null;
  riskFindings: RiskFindings | null;
  invoice: InvoiceRecord | null;
  callbackOutcome: CallbackOutcome | null;
  approval: ApprovalState | null;
  policy: PolicyConfig;
  now: number; // epoch ms; passed in so the engine stays pure
};

export type PolicyResult = {
  decision: Decision;
  firedRules: RuleId[];
  /** Human-readable reason per fired rule, for the UI and the audit log. */
  reasons: string[];
  /** What must happen before the case can move forward. */
  needs: {
    callback: boolean;
    ownerOtp: boolean;
    coolingOffSeconds: number;
  };
  /** false for R8 / R9: even the owner cannot override. */
  overridable: boolean;
};
