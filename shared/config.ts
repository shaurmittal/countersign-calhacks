import type { PolicyConfig } from "./types";

/** Demo policy values from spec §5. */
export const DEMO_POLICY: PolicyConfig = {
  autoPayLimitCents: 2_000_00,
  coolingOffThresholdCents: 10_000_00,
  coolingOffSeconds: 60,
  amountAnomalyPct: 0.25,
};

export const LIMITS = {
  maxMessageChars: 2000,
  maxRequestsPerMessage: 3,
  rateLimitPerSenderPerMinute: 10,
  callbackAnswerTimeoutSeconds: 45,
  callbackRetryDelaySeconds: 20,
};

/** Owner step-up codes (shared/totp.ts): RFC 6238 defaults that every authenticator app supports. */
export const OWNER_CODE = {
  digits: 6,
  periodSeconds: 30,
  /** Also accept the previous and next step, for clock drift and slow typing. */
  window: 1,
};
