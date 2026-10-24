// Convex schema (owner: P1). Field shapes for agent outputs live in shared/types.ts;
// blobs are stored as v.any() here so four people can iterate without schema merge conflicts.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const channel = v.union(
  v.literal("web"),
  v.literal("call"),
  v.literal("sms"),
  v.literal("email"),
  v.literal("agent"),
);

export const caseStatus = v.union(
  v.literal("RECEIVED"),
  v.literal("PARSED"),
  v.literal("VERIFYING"),
  v.literal("CALLBACK_PENDING"),
  v.literal("DECIDED"),
  v.literal("AWAITING_OWNER"),
  v.literal("CLOSED"),
);

export const decision = v.union(
  v.literal("PAY"),
  v.literal("HOLD"),
  v.literal("BLOCK"),
  v.literal("ESCALATE"),
  v.literal("NO_ACTION"),
);

export const agentName = v.union(
  v.literal("intake"),
  v.literal("vendorVerifier"),
  v.literal("riskAnalyst"),
  v.literal("callback"),
  v.literal("policy"),
  v.literal("ownerConcierge"),
  v.literal("payer"),
);

export default defineSchema({
  owner: defineTable({
    name: v.string(),
    company: v.string(),
    phone: v.string(),
    email: v.string(),
    otpPhone: v.string(),
    lastTotpCounter: v.optional(v.number()), // P4: last accepted TOTP step; older or equal codes are replays
    policy: v.object({
      autoPayLimitCents: v.number(),
      coolingOffThresholdCents: v.number(),
      coolingOffSeconds: v.number(),
      amountAnomalyPct: v.number(),
    }),
  }),

  vendors: defineTable({
    name: v.string(),
    aliases: v.array(v.string()),
    domains: v.array(v.string()),
    phoneOnFile: v.string(),
    emailsOnFile: v.array(v.string()),
    bankLast4: v.string(),
    bankRouting: v.string(),
    crsBusinessId: v.optional(v.string()),
    typicalAmountRange: v.array(v.number()), // [minCents, maxCents]
    cadence: v.string(), // "monthly" | "weekly" | "irregular"
    alwaysEscalate: v.optional(v.boolean()),
    knownBadSenders: v.optional(v.array(v.string())),
  }).index("by_name", ["name"]),

  invoices: defineTable({
    vendorId: v.id("vendors"),
    number: v.string(),
    amountCents: v.number(),
    dueDate: v.string(), // ISO date
    status: v.union(v.literal("open"), v.literal("paid"), v.literal("void")),
    paidAt: v.optional(v.number()),
  })
    .index("by_vendor", ["vendorId"])
    .index("by_number", ["number"]),

  cases: defineTable({
    channel,
    fromAddress: v.string(), // phone, email or agent address; display last 4 only
    externalId: v.optional(v.string()), // dedupe key for webhook retries
    rawContent: v.string(),
    status: caseStatus,
    request: v.optional(v.any()), // PaymentRequest
    vendorId: v.optional(v.id("vendors")),
    vendorFindings: v.optional(v.any()), // VendorFindings
    riskFindings: v.optional(v.any()), // RiskFindings
    policyResult: v.optional(v.any()), // PolicyResult
    decision: v.optional(decision),
    riskScore: v.optional(v.number()),
    flags: v.array(v.string()),
    replyText: v.optional(v.string()),
    payStartedAt: v.optional(v.number()), // set once by cases.claimPayment: the lock against paying twice
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_externalId", ["externalId"])
    .index("by_from", ["fromAddress"]),

  agentRuns: defineTable({
    caseId: v.id("cases"),
    agent: agentName,
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("done"), v.literal("failed")),
    summary: v.optional(v.string()), // one line for the War Room lane, e.g. "Vendor match: Pixel & Pine (0.94)"
    input: v.optional(v.any()),
    output: v.optional(v.any()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  }).index("by_case", ["caseId"]),

  callbacks: defineTable({
    caseId: v.id("cases"),
    vendorId: v.id("vendors"),
    numberDialed: v.string(), // always vendors.phoneOnFile, never from the request
    callSid: v.optional(v.string()), // Cartesia agent_call_id
    agentRunId: v.optional(v.id("agentRuns")), // finished when the outcome lands
    attempt: v.number(),
    transcript: v.optional(v.string()), // "Countersign: …" / "Vendor: …" lines, fetched from Cartesia after the call
    summary: v.optional(v.string()), // Cartesia's post-call summary
    outcome: v.optional(
      v.union(v.literal("confirmed"), v.literal("denied"), v.literal("no_answer"), v.literal("unclear")),
    ),
    recordingUrl: v.optional(v.string()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_case", ["caseId"])
    .index("by_callSid", ["callSid"]),

  approvals: defineTable({
    caseId: v.id("cases"),
    method: v.union(v.literal("otp"), v.literal("asi_one")),
    otpHash: v.optional(v.string()), // never store the plain code
    requestedAt: v.number(),
    approvedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    coolingOffUntil: v.optional(v.number()),
    attempts: v.optional(v.number()), // P4: wrong codes entered so far
    lockedUntil: v.optional(v.number()), // P4: set after too many wrong codes
  }).index("by_case", ["caseId"]),

  payments: defineTable({
    caseId: v.id("cases"),
    vendorId: v.id("vendors"),
    invoiceId: v.optional(v.id("invoices")),
    amountCents: v.number(),
    rail: v.union(v.literal("ach_sandbox"), v.literal("mock")),
    idempotencyKey: v.string(), // `${vendorId}:${invoiceNumber}`
    externalId: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    createdAt: v.number(),
  })
    .index("by_case", ["caseId"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  auditEvents: defineTable({
    seq: v.number(),
    caseId: v.optional(v.id("cases")),
    actor: v.string(), // "system" | agent name | "owner" | "policy"
    action: v.string(),
    payload: v.any(),
    prevHash: v.string(),
    hash: v.string(),
    at: v.number(),
  })
    .index("by_seq", ["seq"])
    .index("by_case", ["caseId"]),
});
