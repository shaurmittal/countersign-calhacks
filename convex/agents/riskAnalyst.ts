// Risk Analyst (owner: P3). Spec §6.3.
// Rule-based red flags, a display-only riskScore and a two-sentence explanation:
// shared/verification/assessRisk.ts. It never decides anything. It runs in parallel with the
// Vendor Verifier, so it loads the vendor book and the Moss hits itself and repeats the same match.
// With ANTHROPIC_API_KEY set, Claude rewrites the explanation from the flags (convex/lib/riskExplanation.ts).
// The flags and the score are always assessRisk's, and the template stands whenever Claude can't help.
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import type { PaymentRequest, RiskFindings } from "../../shared/types";
import { assessRisk } from "../../shared/verification/assessRisk";
import { explainRisk } from "../../shared/verification/explain";
import { FLAG_ORDER } from "../../shared/verification/riskFlags";
import { rewriteExplanation, type Explanation } from "../lib/riskExplanation";
import { mossHits } from "./vendorVerifier";

export async function runRiskAnalyst(
  ctx: ActionCtx,
  c: Doc<"cases">,
  request: PaymentRequest,
): Promise<RiskFindings> {
  const hits = mossHits(ctx, request.claimedVendorName);
  const book = await ctx.runQuery(internal.agents.vendorVerifier.loadVerificationBook, {});
  const caseInfo = { channel: c.channel, fromAddress: c.fromAddress, rawContent: c.rawContent, receivedAt: c.createdAt };
  // Claude starts from the in-memory match while Moss searches, so the two waits overlap. A Moss hit can change
  // the vendor match and with it the flags. Claude's words would then describe other flags, so the template stands.
  // `drop` only stops the wait for Claude; rewriteExplanation never aborts the request itself.
  const early = assessRisk({ request, caseInfo, book });
  const drop = new AbortController();
  const rewrite = rewriteExplanation(early.flags, early.explanation, drop.signal);
  const findings = assessRisk({ request, caseInfo, book, searchHits: await hits });
  const sameFlags = findings.flags.join() === early.flags.join();
  if (!sameFlags) drop.abort();
  const { text, source } = await rewrite;
  return sameFlags && source === "claude" ? { ...findings, explanation: text } : findings;
}

/**
 * One rewrite from the CLI, for any flags. With ANTHROPIC_API_KEY set it makes one Claude call; without it,
 * it returns the template:
 * npx convex run agents/riskAnalyst:explainFlags '{"flags":["owner_impersonation","new_sender","urgency"]}'
 */
export const explainFlags = internalAction({
  args: { flags: v.array(v.string()) },
  handler: async (_ctx, { flags }): Promise<Explanation> => {
    const raised = FLAG_ORDER.filter((flag) => flags.includes(flag));
    return rewriteExplanation(raised, explainRisk({ flags: raised, lookalikeDomains: [] }));
  },
});
