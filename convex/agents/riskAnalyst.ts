// Risk Analyst (owner: P3). Spec §6.3.
// Rule-based red flags, a display-only riskScore and a two-sentence explanation:
// shared/verification/assessRisk.ts. It never decides anything. It runs in parallel with the
// Vendor Verifier, so it loads the vendor book and the Moss hits itself and repeats the same match.
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { PaymentRequest, RiskFindings } from "../../shared/types";
import { assessRisk } from "../../shared/verification/assessRisk";
import { mossHits } from "./vendorVerifier";

export async function runRiskAnalyst(
  ctx: ActionCtx,
  c: Doc<"cases">,
  request: PaymentRequest,
): Promise<RiskFindings> {
  const [book, searchHits] = await Promise.all([
    ctx.runQuery(internal.agents.vendorVerifier.loadVerificationBook, {}),
    mossHits(ctx, request.claimedVendorName),
  ]);
  // TODO(P3): when ANTHROPIC_API_KEY is set, have Claude rewrite the explanation in two plain
  // sentences from the flags, falling back to this template on any error. Flags and score stay as is.
  return assessRisk({
    request,
    caseInfo: { channel: c.channel, fromAddress: c.fromAddress, rawContent: c.rawContent, receivedAt: c.createdAt },
    book,
    searchHits,
  });
}
