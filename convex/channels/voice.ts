// Voice channel (owner: P2). Webhook tools called by the two Cartesia agents.
// Every endpoint requires the X-Countersign-Secret header. None of them can move money:
// they open cases, read decisions and record callback outcomes. Setup: docs/cartesia-setup.md
import { v } from "convex/values";
import { httpAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { PolicyResult } from "../../shared/types";
import { policyAnswerWithin } from "../../shared/verification/policyLookup";
import { toolSecretValid } from "../lib/cartesia";
import { senderOverLimit } from "../lib/rateLimit";
import { openCase } from "../cases";

// Must stay under the get_case_status tool timeout in Cartesia (25 s).
const LONG_POLL_MS = 20_000;
const UNKNOWN_CALLER = "unknown-caller";
const POLL_INTERVAL_MS = 1_000;

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function str(value: unknown, max = 2000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function sha8(s: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(bytes).slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Inbound agent tool `submit_payment_request`.
 * Body: { request_text (model), caller_id (system__caller_id), conversation_id (system__conversation_id) }
 * Returns JSON; the tool's assignment saves `case_id` into a dynamic variable for get_case_status.
 */
export const submitPaymentRequest = httpAction(async (ctx, request) => {
  if (!toolSecretValid(request)) {
    console.warn("[voice] submit_payment_request rejected: bad or missing X-Countersign-Secret");
    return text("unauthorized", 401);
  }
  const body = await readJson(request);
  const requestText = str(body.request_text);
  if (!requestText) return text("request_text is required. Ask the caller what they want paid, then try again.", 400);
  const conversationId = str(body.conversation_id, 200) || "unknown-call";
  const callerId = str(body.caller_id, 40) || UNKNOWN_CALLER;

  const opened = await ctx.runMutation(internal.channels.voice.openCallCase, {
    fromAddress: callerId,
    rawContent: requestText,
    // Same call + same text = webhook retry, not a new request.
    externalId: `call:${conversationId}:${await sha8(requestText)}`,
  });
  if (!opened) {
    console.warn(`[voice] submit_payment_request rate-limited caller=…${callerId.slice(-4)}`);
    return text(
      "Too many requests from this number in the last minute. Tell the caller politely that you can't take more requests right now and to try again in a minute. Do not submit again on this call.",
    );
  }
  const { caseId } = opened;
  console.log(`[voice] submit_payment_request conversation=${conversationId} case=${caseId}`);
  return Response.json({
    case_id: caseId,
    message: "Submitted. Tell the caller you are checking it now, then call get_case_status.",
  });
});

/**
 * Inbound agent tool `get_case_status`.
 * Body: { case_id (dynamic variable, may be empty), conversation_id (system__conversation_id) }
 * Falls back to the newest case opened on this call, so it works even if the case_id
 * assignment hasn't landed yet. Always 200 + plain text, because a non-2xx reaches the LLM as an
 * opaque error and it tells the caller it "can't see" the request.
 *
 * Pacing: it long-polls up to 20 s. While the vendor is being called back, only the first check
 * returns straight away (so the agent can say "I'm calling them now"); later checks wait quietly
 * until the outcome lands or 20 s pass, so the agent isn't saying "still checking" every second.
 */
export const getCaseStatus = httpAction(async (ctx, request) => {
  if (!toolSecretValid(request)) {
    console.warn("[voice] get_case_status rejected: bad or missing X-Countersign-Secret");
    return text("unauthorized", 401);
  }
  const body = await readJson(request);
  const caseId = str(body.case_id, 64);
  const conversationId = str(body.conversation_id, 200);
  console.log(`[voice] get_case_status case=${caseId || "-"} conversation=${conversationId || "-"}`);

  const deadline = Date.now() + LONG_POLL_MS;
  let alreadyAnnounced: boolean | null = null;
  for (;;) {
    const status = await ctx.runQuery(internal.channels.voice.statusForVoice, { caseId, conversationId });
    // A check that begins while the callback is already under way waits quietly; only the check
    // that sees the callback start returns straight away so the agent can announce it.
    if (alreadyAnnounced === null) alreadyAnnounced = status.callbackPending;
    const quietWait = alreadyAnnounced && status.callbackPending;
    if (status.final && !quietWait) return text(status.message);
    if (Date.now() >= deadline) return text(quietWait ? stillHolding(status.vendorName) : status.message);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
});

function stillHolding(vendorName: string | null) {
  return (
    `Countersign is still on the line with ${vendorName ?? "the vendor"} on the number already on file; no answer ` +
    `from them yet. If you haven't told the caller you're calling them, say so now and ask them to hold. Otherwise ` +
    `don't repeat yourself: if they speak, say only something short like "Thanks for holding, still waiting on them." ` +
    `Then call get_case_status again.`
  );
}

/**
 * Callback agent tool `record_callback_outcome`.
 * Body: { callback_id (dynamic variable), conversation_id (system__conversation_id),
 *         outcome (model: confirmed|denied|unclear), invoice_number_stated (model), notes (model) }
 */
export const recordCallbackOutcome = httpAction(async (ctx, request) => {
  if (!toolSecretValid(request)) return text("unauthorized", 401);
  const body = await readJson(request);
  const callbackId = str(body.callback_id, 64);
  const outcome = str(body.outcome, 20);
  if (!callbackId) return text("Missing callback_id.", 400);
  if (outcome !== "confirmed" && outcome !== "denied" && outcome !== "unclear") {
    return text('outcome must be "confirmed", "denied" or "unclear".', 400);
  }
  try {
    const result = await ctx.runMutation(internal.agents.callbackVerifier.reportFromAgent, {
      callbackId: callbackId as Id<"callbacks">,
      outcome,
      invoiceNumberStated: str(body.invoice_number_stated, 64) || undefined,
      conversationId: str(body.conversation_id, 200) || undefined,
      notes: str(body.notes, 500) || undefined,
    });
    return text(result.message, result.ok ? 200 : 404);
  } catch {
    return text("Unknown callback.", 404);
  }
});

/**
 * Tool `lookup_policy` on both agents: the Countersign policy that answers "why does this need a callback?",
 * "can I pay in gift cards?" or "what happens next?" (internal.agents.moss.lookupPolicy, P3). Policy sentences
 * only, never invoices, amounts or accounts. Body: { question (model), conversation_id (system__conversation_id) }.
 * Moss answers when it's back within POLICY_TOOL_BUDGET_MS, a cold Node start included; otherwise the keyword
 * ranking does, so the agent never waits longer than that. Always 200 + plain text, like get_case_status.
 * It reads nothing about the case, so it can't slow down or change a decision.
 */
export const lookupPolicy = httpAction(async (ctx, request) => {
  if (!toolSecretValid(request)) {
    console.warn("[voice] lookup_policy rejected: bad or missing X-Countersign-Secret");
    return text("unauthorized", 401);
  }
  const body = await readJson(request);
  const question = str(body.question, 500);
  if (!question) {
    return text("Ask what they want to know about how Countersign handles payments, then call lookup_policy with it.");
  }
  const started = Date.now();
  const answer = await policyAnswerWithin(ctx.runAction(internal.agents.moss.lookupPolicy, { question }), question);
  console.log(`[voice] lookup_policy source=${answer.source} rules=${answer.rules.join(",") || "-"} ms=${Date.now() - started}`);
  return text(answer.message);
});

/** Opens a call case unless this caller is over the per-minute limit (null). Unknown caller IDs share no bucket. */
export const openCallCase = internalMutation({
  args: { fromAddress: v.string(), rawContent: v.string(), externalId: v.string() },
  handler: async (ctx, args) => {
    if (args.fromAddress !== UNKNOWN_CALLER && (await senderOverLimit(ctx, args.fromAddress))) return null;
    return openCase(ctx, { channel: "call", ...args });
  },
});

/** Voice-friendly status of a case. `final` means the agent should stop polling. */
export const statusForVoice = internalQuery({
  args: { caseId: v.string(), conversationId: v.string() },
  handler: async (ctx, { caseId, conversationId }) => {
    const id = caseId ? ctx.db.normalizeId("cases", caseId) : null;
    let c = id ? await ctx.db.get(id) : null;
    if (!c && conversationId) {
      // Newest case submitted on this call (externalId = call:<conversationId>:<hash>).
      const prefix = `call:${conversationId}:`;
      c = await ctx.db
        .query("cases")
        .withIndex("by_externalId", (q) => q.gte("externalId", prefix).lt("externalId", `${prefix}\uffff`))
        .collect()
        .then((rows) => rows.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null);
    }
    const none = { callbackPending: false, vendorName: null as string | null };
    if (!c) {
      return {
        ...none,
        final: true,
        message: "No request has been submitted on this call yet. Get the details from the caller and call submit_payment_request first.",
      };
    }

    const policy = c.policyResult as PolicyResult | undefined;
    const reasons = policy?.reasons?.length ? ` Reasons: ${policy.reasons.join("; ")}.` : "";
    const say = c.replyText ? ` Tell the caller, in your own words: "${c.replyText}"` : "";

    if (c.status === "CALLBACK_PENDING") {
      const vendor = c.vendorId ? await ctx.db.get(c.vendorId) : null;
      const vendorName = vendor?.name ?? null;
      return {
        callbackPending: true,
        vendorName,
        final: true,
        message:
          `Still verifying. Countersign is calling ${vendorName ?? "the vendor"} right now on the phone number ` +
          `already on file to confirm this request. Tell the caller that once, ask them to hold, then call get_case_status again. ` +
          `It will wait quietly for the answer, so you don't need to fill the silence.`,
      };
    }
    // The leader writes replyText just after the decision; keep polling until it lands.
    if (c.status === "AWAITING_OWNER") {
      return {
        ...none,
        final: !!c.replyText,
        message: `Decision: ${c.decision ?? "ESCALATE"}. The owner must approve this from her registered device; nothing is paid until she does.${reasons}${say}`,
      };
    }
    if (c.status === "CLOSED") {
      return { ...none, final: !!c.replyText, message: `Decision: ${c.decision ?? "HOLD"}.${reasons}${say}` };
    }
    return {
      ...none,
      final: false,
      message: "Still checking. Tell the caller briefly that you are still verifying, then call get_case_status again.",
    };
  },
});
