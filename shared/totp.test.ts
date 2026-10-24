import { Secret, TOTP } from "otpauth";
import { describe, expect, it } from "vitest";
import { checkTotp, newTotpEnrollment } from "./totp";

// RFC 6238 Appendix B test secret ("12345678901234567890" as ASCII), SHA-1. The 6-digit code is
// the last 6 digits of the RFC's 8-digit value: T=59 s -> 94287082 -> 287082.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const T59 = 59_000;
const STEP_MS = 30_000;

describe("checkTotp", () => {
  it("accepts the RFC 6238 test vector at its own time", () => {
    expect(checkTotp({ secretBase32: RFC_SECRET, code: "287082", now: T59 })).toEqual({ ok: true, counter: 1 });
  });

  it("accepts more RFC 6238 vectors (6-digit truncation)", () => {
    expect(checkTotp({ secretBase32: RFC_SECRET, code: "081804", now: 1_111_111_109_000 }).ok).toBe(true);
    expect(checkTotp({ secretBase32: RFC_SECRET, code: "005924", now: 1_234_567_890_000 }).ok).toBe(true);
    expect(checkTotp({ secretBase32: RFC_SECRET, code: "279037", now: 2_000_000_000_000 }).ok).toBe(true);
  });

  it("accepts a code typed with spaces", () => {
    expect(checkTotp({ secretBase32: RFC_SECRET, code: "287 082", now: T59 }).ok).toBe(true);
  });

  it("accepts the code from the previous 30 s step (clock drift window)", () => {
    expect(checkTotp({ secretBase32: RFC_SECRET, code: "287082", now: T59 + STEP_MS })).toEqual({ ok: true, counter: 1 });
  });

  it("rejects a code two steps old", () => {
    expect(checkTotp({ secretBase32: RFC_SECRET, code: "287082", now: T59 + 2 * STEP_MS })).toEqual({
      ok: false,
      reason: "wrong",
    });
  });

  it("rejects a wrong code", () => {
    expect(checkTotp({ secretBase32: RFC_SECRET, code: "123456", now: T59 })).toEqual({ ok: false, reason: "wrong" });
  });

  it("rejects malformed input without checking the secret", () => {
    expect(checkTotp({ secretBase32: RFC_SECRET, code: "28708", now: T59 }).ok).toBe(false);
    expect(checkTotp({ secretBase32: RFC_SECRET, code: "abcdef", now: T59 })).toEqual({ ok: false, reason: "malformed" });
    expect(checkTotp({ secretBase32: RFC_SECRET, code: "", now: T59 })).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects a replay of an already accepted code", () => {
    expect(checkTotp({ secretBase32: RFC_SECRET, code: "287082", now: T59, lastCounter: 1 })).toEqual({
      ok: false,
      reason: "replayed",
    });
  });

  it("accepts a newer code after an older one was used", () => {
    expect(checkTotp({ secretBase32: RFC_SECRET, code: "287082", now: T59, lastCounter: 0 }).ok).toBe(true);
  });
});

describe("newTotpEnrollment", () => {
  it("returns a secret whose codes verify", () => {
    const { secretBase32, uri } = newTotpEnrollment("Priya Raman");
    expect(uri).toMatch(/^otpauth:\/\/totp\/Countersign:Priya%20Raman\?/);
    expect(uri).toContain(`secret=${secretBase32}`);
    const code = TOTP.generate({ secret: Secret.fromBase32(secretBase32), timestamp: T59 });
    expect(checkTotp({ secretBase32, code, now: T59 }).ok).toBe(true);
  });
});
