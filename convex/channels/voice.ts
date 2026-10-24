// Voice channel (owner: P2). Webhook tools called by the two Cartesia agents.
// Every endpoint requires the X-Countersign-Secret header. None of them can move money:
// they open cases, read decisions and record callback outcomes. Setup: docs/cartesia-setup.md
import { v } from "convex/values";
import { httpAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { PolicyResult } from "../../shared/types";
import { toolSecretValid } from "../lib/cartesia";

const LONG_POLL_MS = 15_000;
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
  const callerId = str(body.caller_id, 40) || "unknown-caller";

  const { caseId } = await ctx.runMutation(internal.cases.open, {
    channel: "call",
    fromAddress: callerId,
    rawContent: requestText,
    // Same call + same text = webhook retry, not a new request.
    externalId: `call:${conversationId}:${await sha8(requestText)}`,
  });
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
 * assignment hasn't landed yet. Long-polls up to 15 s. Always 200 + plain text, because a
 * non-2xx reaches the LLM as an opaque error and it tells the caller it "can't see" the request.
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
  for (;;) {
    const status = await ctx.runQuery(internal.channels.voice.statusForVoice, { caseId, conversationId });
    if (status.final || Date.now() >= deadline) return text(status.message);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
});

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
    if (!c) {
      return {
        final: true,
        message: "No request has been submitted on this call yet. Get the details from the caller and call submit_payment_request first.",
      };
    }

    const policy = c.policyResult as PolicyResult | undefined;
    const reasons = policy?.reasons?.length ? ` Reasons: ${policy.reasons.join("; ")}.` : "";
    const say = c.replyText ? ` Tell the caller, in your own words: "${c.replyText}"` : "";

    if (c.status === "CALLBACK_PENDING") {
      const vendor = c.vendorId ? await ctx.db.get(c.vendorId) : null;
      return {
        final: true,
        message:
          `Still verifying. Countersign is calling ${vendor?.name ?? "the vendor"} right now on the phone number ` +
          `already on file to confirm this request. Tell the caller that, ask them to hold, then call get_case_status again in about 20 seconds.`,
      };
    }
    if (c.status === "AWAITING_OWNER") {
      return {
        final: true,
        message: `Decision: ${c.decision ?? "ESCALATE"}. The owner must approve this from her registered device; nothing is paid until she does.${reasons}${say}`,
      };
    }
    if (c.status === "CLOSED") {
      return { final: true, message: `Decision: ${c.decision ?? "HOLD"}.${reasons}${say}` };
    }
    return {
      final: false,
      message: "Still checking. Tell the caller you are still verifying, then call get_case_status again.",
    };
  },
});
