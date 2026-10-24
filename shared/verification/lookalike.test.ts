// Lookalike-domain checks on the seed world (owner: P3). Spec §1 item 3, §6.3.
import { describe, expect, it } from "vitest";
import { buildSeedBook } from "../seedWorld";
import {
  BRAND_LABELS,
  WELL_KNOWN_DOMAINS,
  extractDomains,
  findLookalikeDomains,
  isLookalikeDomain,
  registrableDomain,
} from "./lookalike";

const { vendors } = buildSeedBook();
const ownerEmail = "priya@lumenlabs.example";

describe("isLookalikeDomain on the seed world", () => {
  it.each([
    ["pixelandpine.example", "Pixel & Pine's domain"],
    ["billing.pixelandpine.example", "a subdomain of a vendor's domain"],
    ["northwindcloud.example", "Northwind's domain"],
    ["mail.example", "the domain of Sam's email on file"],
    ["amazon.com", "well-known"],
    ["aws.amazon.com", "well-known"],
    ["console.aws.amazon.com", "a subdomain of a well-known domain"],
    ["google.com", "well-known"],
    ["workspace.google.com", "well-known"],
    ["irs.gov", "well-known"],
    ["ftb.ca.gov", "well-known"],
    ["example.com", "imitates nothing"],
    ["stanford.edu", "imitates nothing"],
    ["mall.com", "an email-on-file domain (mail.example) is not a brand"],
    ["phase.com", "a letter off chase, but short names only match exactly"],
    ["apply.com", "a letter off apple, but short names only match exactly"],
    ["laws.com", "a brand (aws) must be a whole token"],
    ["WWW.PixelAndPine.Example.", "normalized before the check"],
  ])("%s is not a lookalike: %s", (host) => {
    expect(isLookalikeDomain(host, vendors, ownerEmail)).toBe(false);
  });

  it.each([
    ["pixelandpine.co", "a vendor's name on another TLD"],
    ["pixel-and-pine.example", "a vendor's name with hyphens"],
    ["northwind-cloud.example", "a vendor's name with a hyphen"],
    ["nortwindcloud.example", "a vendor's name missing a letter"],
    ["northwindcloud.example.billing-portal.net", "a vendor's domain as a subdomain of another site"],
    ["harborlegal.co", "a vendor's name on another TLD"],
    ["aws-billing.com", "a brand as a token"],
    ["amazon-invoices.net", "a brand as a token"],
    ["amaz0n.com", "a zero for the o"],
    ["arnazon.com", "rn for m"],
    ["g00gle.com", "zeros for the o's"],
    ["google-workspace-billing.com", "a brand as a token"],
    ["paypa1.com", "a one for the l"],
    ["rnicrosoft.com", "rn for m"],
    ["docusing.com", "two letters swapped"],
    ["xn--pple-43d.com", "punycode for apple with a Cyrillic a"],
    ["irs-gov.com", "an agency as a token"],
    ["ftb-refund.com", "an agency as a token"],
    ["lumen-labs.example", "the owner's company name with a hyphen"],
    ["goggle.com", "one letter changed"],
    ["paypals.com", "one letter added"],
    ["amazon.com.billing-update.net", "a well-known domain as a subdomain of another site"],
    ["pixelandpine-payments.example", "a vendor's name as a token"],
    ["amazonbilling.com", "a brand as a prefix"],
    ["paypalsupport.com", "a brand as a prefix"],
    ["WWW.PayPa1.com.", "normalized before the check"],
  ])("%s is a lookalike: %s", (host) => {
    expect(isLookalikeDomain(host, vendors, ownerEmail)).toBe(true);
  });

  it("takes vendor and owner names from the book", () => {
    expect(isLookalikeDomain("pixelandpine.co", [], null)).toBe(false);
    expect(isLookalikeDomain("lumen-labs.example", vendors)).toBe(false);
  });

  it("never flags a well-known domain, and flags every brand on another TLD", () => {
    expect(WELL_KNOWN_DOMAINS.filter((domain) => isLookalikeDomain(domain, []))).toEqual([]);
    expect(BRAND_LABELS.filter((brand) => !isLookalikeDomain(`${brand}.biz`, []))).toEqual([]);
  });
});

describe("extractDomains", () => {
  it("reads URL hosts, email domains and bare domains, normalized and in order", () => {
    const text =
      "Pay at https://aws-billing.com/pay?x=1 or email billing@pixelandpine.co. See www.Northwind-Cloud.example.";
    expect(extractDomains(text)).toEqual(["aws-billing.com", "pixelandpine.co", "northwind-cloud.example"]);
  });

  it.each(["Urgent: AWS invoice $2,999 or your servers shut down", "invoice.pdf attached, total 4,800.00"])(
    "finds no domain in %s",
    (text) => {
      expect(extractDomains(text)).toEqual([]);
    },
  );

  it("takes a URL's host, not its user info, port or path", () => {
    expect(extractDomains("Sign in: https://amazon.com@paypa1.com:8443/index.html")).toEqual(["paypa1.com"]);
    expect(extractDomains("Portal: evil.example/login/index.html")).toEqual(["evil.example"]);
  });

  it("skips an email's local part and repeated domains", () => {
    const text = "sam.ortiz@mail.example, first.last+ap@Mail.Example or mail.example";
    expect(extractDomains(text)).toEqual(["mail.example"]);
  });

  it("keeps punycode domains", () => {
    expect(extractDomains("Renew at xn--pple-43d.com today")).toEqual(["xn--pple-43d.com"]);
  });

  it("handles 2,000-character adversarial input", () => {
    expect(extractDomains("a.".repeat(1000))).toEqual([]);
    expect(extractDomains("a+".repeat(1000))).toEqual([]);
    expect(extractDomains(".-".repeat(1000))).toEqual([]);
    const rawContent = `${"x".repeat(1990)}.example`;
    expect(findLookalikeDomains({ fromAddress: "", rawContent, vendors, ownerEmail })).toEqual([]);
  });
});

describe("findLookalikeDomains", () => {
  const book = { vendors, ownerEmail };

  it("flags the sender's email domain", () => {
    const found = findLookalikeDomains({
      ...book,
      fromAddress: "billing@pixelandpine.co",
      rawContent: "Invoice #1042 for $4,800 is due.",
    });
    expect(found).toEqual(["pixelandpine.co"]);
  });

  it("finds nothing for a phone sender whose text names no domain", () => {
    const found = findLookalikeDomains({
      ...book,
      fromAddress: "+15555559003",
      rawContent: "Urgent: AWS invoice $2,999 or your servers shut down",
    });
    expect(found).toEqual([]);
  });

  it("lists the sender's domain once and first, then the text's lookalikes, and skips known domains", () => {
    const found = findLookalikeDomains({
      ...book,
      fromAddress: "Pixel & Pine <billing@pixelandpine.co>",
      rawContent: "Pay at https://pixelandpine.co/pay or paypa1.com, not pixelandpine.example.",
    });
    expect(found).toEqual(["pixelandpine.co", "paypa1.com"]);
  });
});

describe("registrableDomain", () => {
  it.each([
    ["billing.example.co.uk", "example.co.uk"],
    ["ftb.ca.gov", "ftb.ca.gov"],
    ["console.aws.amazon.com", "amazon.com"],
    ["northwindcloud.example.billing-portal.net", "billing-portal.net"],
    ["localhost", "localhost"],
  ])("%s -> %s", (host, expected) => {
    expect(registrableDomain(host)).toBe(expected);
  });
});

describe("homographs, folded tokens and false positives", () => {
  it.each([
    ["northwind-cloud-billing.example", "a vendor's name split by hyphens, as a prefix"],
    ["amaz0n-billing.com", "a folded brand as a token"],
    ["secure-paypa1.com", "a folded brand as a token"],
    ["office365-billing.com", "a brand with digits as a token"],
    ["pаypal.com", "a Cyrillic а typed directly"],
    ["аpple.com", "a Cyrillic а typed directly"],
  ])("%s is a lookalike: %s", (host) => {
    expect(isLookalikeDomain(host, vendors, ownerEmail)).toBe(true);
  });

  it.each([
    ["pineapple.com", "a 5-letter brand (apple) only matches as a whole name or token"],
    ["humanlabs.com", "two edits from a 9-letter name (lumenlabs) is too far"],
    ["amazon.co.uk", "well-known"],
    ["amazonses.com", "well-known"],
  ])("%s is not a lookalike: %s", (host) => {
    expect(isLookalikeDomain(host, vendors, ownerEmail)).toBe(false);
  });

  it("reads a homograph typed into the text or the sender's address", () => {
    expect(extractDomains("Renew at pаypal.com today")).toEqual(["pаypal.com"]);
    expect(findLookalikeDomains({ fromAddress: "billing@pаypal.com", rawContent: "", vendors, ownerEmail })).toEqual([
      "pаypal.com",
    ]);
  });

  it("reads a domain glued to text in another script", () => {
    expect(extractDomains("请付款给northwind-cloud.example谢谢")).toEqual(["northwind-cloud.example"]);
  });

  it("doesn't read a missing space after a period as a domain, except after an @", () => {
    expect(extractDomains("Thanks from Amazon.Please pay soon")).toEqual([]);
    expect(extractDomains("Write to billing@Pixelandpine.Example")).toEqual(["pixelandpine.example"]);
  });

  it("reads -- as a dash, but keeps punycode", () => {
    expect(extractDomains("Pay now--paypal.com")).toEqual(["paypal.com"]);
    expect(findLookalikeDomains({ fromAddress: "", rawContent: "Pay now--paypal.com", vendors, ownerEmail })).toEqual([]);
    expect(extractDomains("Renew at XN--PPLE-43D.COM")).toEqual(["xn--pple-43d.com"]);
  });
});
