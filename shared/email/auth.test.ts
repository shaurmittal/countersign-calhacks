import { describe, expect, it } from "vitest";
import { aligned, assessEmailAuth, authBadge, displayNameClaim, parseAuthenticationResults, parseSpamTests, type Header } from "./auth";

const gmailPass: Header[] = [
  {
    Name: "Authentication-Results",
    Value:
      "inbound.postmarkapp.com; dkim=pass (2048-bit key) header.d=gmail.com header.i=@gmail.com header.s=20230601; spf=pass (inbound.postmarkapp.com: domain of judge@gmail.com designates 209.85.0.1 as permitted sender) smtp.mailfrom=judge@gmail.com; dmarc=pass (p=NONE sp=QUARANTINE) header.from=gmail.com",
  },
];

describe("parseAuthenticationResults", () => {
  it("reads each method's result and domain, ignoring comments", () => {
    const r = parseAuthenticationResults(gmailPass[0].Value);
    expect(r.dkim).toEqual([{ result: "pass", domain: "gmail.com" }]);
    expect(r.spf).toEqual([{ result: "pass", domain: "gmail.com" }]);
    expect(r.dmarc).toEqual([{ result: "pass", domain: "gmail.com" }]);
  });

  it("a 'dkim=pass' written inside a comment is not a result", () => {
    const r = parseAuthenticationResults("mx.example; spf=fail (dkim=pass dmarc=pass) smtp.mailfrom=x@evil.example");
    expect(r.dkim).toEqual([]);
    expect(r.dmarc).toEqual([]);
    expect(r.spf[0].result).toBe("fail");
  });
});

describe("assessEmailAuth", () => {
  it("passes a Gmail message whose domain checks all pass", () => {
    const a = assessEmailAuth({ headers: gmailPass, from: "judge@gmail.com" });
    expect(a).toMatchObject({ spf: "pass", dkim: "pass", dmarc: "pass", verdict: "pass" });
    expect(authBadge(a)).toBe("SPF ✓ DKIM ✓ DMARC ✓");
  });

  it("fails a forged From: DMARC fail for the vendor's domain", () => {
    const headers: Header[] = [
      {
        Name: "Authentication-Results",
        Value: "inbound.postmarkapp.com; dkim=none; spf=pass smtp.mailfrom=bounce@cheap-vps.example; dmarc=fail (p=REJECT) header.from=pixelandpine.com",
      },
    ];
    const a = assessEmailAuth({ headers, from: "billing@pixelandpine.com" });
    expect(a.verdict).toBe("fail");
    expect(a.dmarc).toBe("fail");
  });

  it("an SPF pass for some other domain proves nothing about From", () => {
    const headers: Header[] = [
      { Name: "Authentication-Results", Value: "mx.example; spf=pass smtp.mailfrom=bounce@mailer.example; dkim=pass header.d=mailer.example" },
    ];
    const a = assessEmailAuth({ headers, from: "billing@pixelandpine.com" });
    expect(a.verdict).toBe("unknown");
    expect(a.dkim).toBe("none");
  });

  it("trusts only the topmost Authentication-Results: a sender can't plant a fake pass further down", () => {
    const headers: Header[] = [
      { Name: "Authentication-Results", Value: "inbound.postmarkapp.com; spf=fail smtp.mailfrom=billing@pixelandpine.com; dmarc=fail header.from=pixelandpine.com" },
      { Name: "Authentication-Results", Value: "mx.pixelandpine.com; spf=pass smtp.mailfrom=billing@pixelandpine.com; dkim=pass header.d=pixelandpine.com; dmarc=pass header.from=pixelandpine.com" },
    ];
    expect(assessEmailAuth({ headers, from: "billing@pixelandpine.com" }).verdict).toBe("fail");
  });

  it("falls back to Received-SPF and SpamAssassin's tests when there is no Authentication-Results", () => {
    const headers: Header[] = [
      { Name: "Received-SPF", Value: "Pass (sender SPF authorized) identity=mailfrom; client-ip=1.2.3.4; envelope-from=billing@sub.vendor.example; receiver=x" },
      { Name: "X-Spam-Tests", Value: "DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU,SPF_PASS" },
    ];
    const a = assessEmailAuth({ headers, from: "billing@vendor.example" });
    expect(a).toMatchObject({ spf: "pass", dkim: "pass", verdict: "pass" });
  });

  it("is unknown, not pass, with no authentication headers at all", () => {
    expect(assessEmailAuth({ headers: [], from: "billing@pixelandpine.example" }).verdict).toBe("unknown");
  });

  it("flags a Reply-To on another domain, but not on the sender's own", () => {
    expect(assessEmailAuth({ headers: gmailPass, from: "judge@gmail.com", replyTo: "pay@northwind-remit.example" }).replyToDomain).toBe(
      "northwind-remit.example",
    );
    expect(assessEmailAuth({ headers: [], from: "a@vendor.example", replyTo: "Billing <b@billing.vendor.example>" }).replyToDomain).toBeNull();
  });

  it("flags a display name that carries someone else's address", () => {
    const a = assessEmailAuth({ headers: gmailPass, from: "pixel.billing@gmail.com", fromName: "billing@pixelandpine.example" });
    expect(a.displayNameClaims).toBe("billing@pixelandpine.example");
  });
});

describe("helpers", () => {
  it("aligned compares registrable domains", () => {
    expect(aligned("mail.pixelandpine.com", "pixelandpine.com")).toBe(true);
    expect(aligned("pixelandpine.com.evil.example", "pixelandpine.com")).toBe(false);
    expect(aligned(null, "x.com")).toBe(false);
  });

  it("displayNameClaim ignores plain names and the sender's own domain", () => {
    expect(displayNameClaim("Pixel & Pine Billing", "pixelandpine.com")).toBeNull();
    expect(displayNameClaim("Billing (pixelandpine.com)", "pixelandpine.com")).toBeNull();
    expect(displayNameClaim("Billing (pixelandpine.com)", "gmail.com")).toBe("pixelandpine.com");
  });

  it("parseSpamTests reads SPF, aligned DKIM and DMARC", () => {
    expect(parseSpamTests("SPF_FAIL,DKIM_SIGNED,DMARC_REJECT")).toEqual({ spf: "fail", dkimAligned: "fail", dmarc: "fail" });
    expect(parseSpamTests("SPF_SOFTFAIL")).toMatchObject({ spf: "softfail", dkimAligned: "unknown" });
  });
});
