// The countersignature (owner: P1). signRelease turns the Policy Engine's PAY into one signed transfer
// instruction for Lumen Bank. It is called ONLY from runPayer (convex/agents/payer.ts), after
// payments.begin has checked PAY, vendor, invoice and duplicates and read the destination from the
// vendor record. A test fails if anything else imports it (convex/lib/countersign.test.ts).
//
// The private key (COUNTERSIGN_SIGNING_KEY) is read here and nowhere else. The bank only holds the public
// key. In this hackathon both run in one Convex deployment; in production the signer runs as its own
// isolated service and the bank holds only the public key.
import type { PaymentPlan } from "../payments";
import type { PolicyResult } from "../../shared/types";
import { RELEASE_TTL_MS, jwkFromEnv, sha256Hex, signPayload, type ReleasePayload } from "../../shared/bank/payload";

export type SignedRelease = { payload: ReleasePayload; signature: string; signatureHash: string };

export async function signRelease(plan: Extract<PaymentPlan, { ok: true }>, policyResult: PolicyResult | undefined): Promise<SignedRelease> {
  if (policyResult?.decision !== "PAY") throw new Error("signRelease: the Policy Engine did not return PAY");
  const key = jwkFromEnv(process.env.COUNTERSIGN_SIGNING_KEY);
  if (!key?.d) throw new Error("COUNTERSIGN_SIGNING_KEY is not set (run scripts/countersign-keygen.ts)");
  const issuedAt = Date.now();
  const payload: ReleasePayload = {
    v: 1,
    caseId: plan.caseId,
    paymentId: plan.paymentId,
    vendorId: plan.vendorId,
    routing: plan.bankRouting,
    last4: plan.bankLast4,
    amountCents: plan.amountCents,
    invoiceNumber: plan.invoiceNumber,
    decision: "PAY",
    firedRules: [...policyResult.firedRules],
    issuedAt,
    expiresAt: issuedAt + RELEASE_TTL_MS,
    nonce: crypto.randomUUID(),
  };
  const signature = await signPayload(payload, key);
  return { payload, signature, signatureHash: await sha256Hex(signature) };
}
