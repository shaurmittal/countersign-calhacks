// Lumen Bank's own boundary (owner: P1). Pure: the caller (convex/bank.ts) looks up the nonce, the payee
// and the balance, and this decides. The bank trusts nothing about the sender: only a payload that
// verifies against the bank's public key, for a payee on the bank's own file, moves money.
//
// Checks, in order (the first failure is the reason):
//   signature present · well-formed instruction · bank has a verify key · signature verifies ·
//   decision is PAY · nonce unused · not expired · payee on file · destination matches · payee active ·
//   funds available
// The nonce is checked before expiry so that replaying a real transfer always reads "already used".
import { parsePayload, verifyPayload, type ReleasePayload } from "./payload";

export type BankPayeeView = { routing: string; accountLast4: string; status: "active" | "frozen" };

export type TransferContext = {
  verifyKey: JsonWebKey | null;
  now: number;
  nonceUsed: boolean;
  payee: BankPayeeView | null;
  balanceCents: number | null;
};

export type RejectCode =
  | "no_signature"
  | "malformed"
  | "no_verify_key"
  | "bad_signature"
  | "not_pay"
  | "replayed"
  | "expired"
  | "unknown_payee"
  | "payee_mismatch"
  | "payee_frozen"
  | "no_account"
  | "insufficient_funds";

export const REJECT_REASON: Record<RejectCode, string> = {
  no_signature: "No countersignature",
  malformed: "Not a valid transfer instruction",
  no_verify_key: "The bank has no verification key configured",
  bad_signature: "Countersignature invalid",
  not_pay: "Not a PAY decision",
  replayed: "Countersignature already used",
  expired: "Countersignature expired",
  unknown_payee: "Payee not on the bank's file",
  payee_mismatch: "Destination doesn't match the bank's payee record",
  payee_frozen: "Payee frozen while Countersign checks a bank-detail change",
  no_account: "No operating account",
  insufficient_funds: "Insufficient funds",
};

export type TransferVerdict =
  | { ok: true; payload: ReleasePayload; consumeNonce: true }
  | { ok: false; code: RejectCode; reason: string; consumeNonce: boolean };

const reject = (code: RejectCode, consumeNonce = false): TransferVerdict => ({ ok: false, code, reason: REJECT_REASON[code], consumeNonce });

export async function evaluateTransfer(payload: unknown, signature: string | null | undefined, ctx: TransferContext): Promise<TransferVerdict> {
  if (!signature) return reject("no_signature");
  const p = parsePayload(payload);
  if (!p) return reject("malformed");
  if (!ctx.verifyKey) return reject("no_verify_key"); // fail closed: no key, no money
  if (!(await verifyPayload(payload, signature, ctx.verifyKey))) return reject("bad_signature");
  if (p.decision !== "PAY") return reject("not_pay");
  if (ctx.nonceUsed) return reject("replayed");
  // From here on the instruction is genuine and fresh: it is consumed whether or not it goes through.
  if (ctx.now > p.expiresAt) return reject("expired", true);
  if (!ctx.payee) return reject("unknown_payee", true);
  if (ctx.payee.routing !== p.routing || ctx.payee.accountLast4 !== p.last4) return reject("payee_mismatch", true);
  if (ctx.payee.status !== "active") return reject("payee_frozen", true);
  if (ctx.balanceCents === null) return reject("no_account", true);
  if (ctx.balanceCents < p.amountCents) return reject("insufficient_funds", true);
  return { ok: true, payload: p as ReleasePayload, consumeNonce: true };
}
