// Owner step-up codes (owner: P4). Spec §6.5: approval needs a one-time code from the owner's
// registered device. The device is an authenticator app holding OWNER_TOTP_SECRET (RFC 6238,
// SHA-1, 6 digits, 30 s), so nothing is ever sent over SMS or voice.
import { Secret, TOTP } from "otpauth";
import { OWNER_CODE } from "./config";

const { digits: TOTP_DIGITS, periodSeconds: TOTP_PERIOD_SECONDS, window: TOTP_WINDOW } = OWNER_CODE;

const CODE_PATTERN = new RegExp(`^\\d{${TOTP_DIGITS}}$`);

export type TotpRejection = "malformed" | "wrong" | "replayed";
export type TotpCheck = { ok: true; counter: number } | { ok: false; reason: TotpRejection };

/**
 * Checks a code against the secret at time `now` (epoch ms). `lastCounter` is the step of the
 * last accepted code: a code from that step or earlier is a replay and is rejected (RFC 6238 §5.2).
 */
export function checkTotp(args: {
  secretBase32: string;
  code: string;
  now: number;
  lastCounter?: number | null;
}): TotpCheck {
  const token = args.code.replace(/\s/g, "");
  if (!CODE_PATTERN.test(token)) return { ok: false, reason: "malformed" };

  const delta = TOTP.validate({
    token,
    secret: Secret.fromBase32(args.secretBase32),
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    timestamp: args.now,
    window: TOTP_WINDOW,
  });
  if (delta === null) return { ok: false, reason: "wrong" };

  const counter = TOTP.counter({ period: TOTP_PERIOD_SECONDS, timestamp: args.now }) + delta;
  if (args.lastCounter != null && counter <= args.lastCounter) return { ok: false, reason: "replayed" };
  return { ok: true, counter };
}

/** Human-readable reason for the owner page and the ASI:One reply. */
export function describeRejection(reason: TotpRejection): string {
  switch (reason) {
    case "malformed":
      return `Enter the ${TOTP_DIGITS}-digit code from your authenticator app.`;
    case "wrong":
      return "That code is not valid. Check the Countersign entry in your authenticator app.";
    case "replayed":
      return "That code was already used. Wait for the next code in your app.";
  }
}

/** New secret plus the otpauth:// URI an authenticator app imports. Used by the enrollment script. */
export function newTotpEnrollment(label: string): { secretBase32: string; uri: string } {
  const totp = new TOTP({
    issuer: "Countersign",
    label,
    secret: new Secret({ size: 20 }),
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
  });
  return { secretBase32: totp.secret.base32, uri: totp.toString() };
}
