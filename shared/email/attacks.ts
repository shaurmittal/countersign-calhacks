// Email attacks for /try (owner: P2). A judge can't forge DMARC from their own inbox, so these are
// crafted webhook payloads: the headers a receiving mail server would add for each trick. They go
// through the same parser (shared/email/inbound.ts), the same agents and the same lock as real mail;
// the case is marked simulated so the War Room says so.
// Every attack names Northwind or the owner, whose numbers on file are fictional: firing one never
// rings a real person's phone.
import { NORTHWIND_LOOKALIKE_INVOICE_PDF } from "./attackPdf";
import type { PostmarkInbound } from "./inbound";

export type EmailAttackId = "forged-vendor" | "forged-ceo" | "diverted-replies" | "display-name" | "pdf-bank-change";

export type EmailAttack = {
  id: EmailAttackId;
  title: string;
  /** One line on the trick, shown on the card. */
  trick: string;
  /** What a careless inbox shows: who it seems to be from. */
  shownFrom: string;
  subject: string;
  payload: () => PostmarkInbound;
};

const RECEIVER = "inbound.postmarkapp.com";

function results(parts: string): { Name: string; Value: string }[] {
  return [{ Name: "Authentication-Results", Value: `${RECEIVER}; ${parts}` }];
}

function id(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}@sim.countersign`;
}

export const EMAIL_ATTACKS: EmailAttack[] = [
  {
    id: "forged-vendor",
    title: "The forged vendor",
    trick: "From: says Northwind's real billing address. The domain's own checks say it never sent it.",
    shownFrom: "Northwind Cloud <invoices@northwindcloud.example>",
    subject: "Invoice NW-889: updated bank details",
    payload: () => ({
      From: "invoices@northwindcloud.example",
      FromFull: { Email: "invoices@northwindcloud.example", Name: "Northwind Cloud" },
      Subject: "Invoice NW-889: updated bank details",
      MessageID: id(),
      Headers: results(
        "dkim=none (message not signed); spf=fail (domain of bounce@vps-2291.example does not designate 45.83.10.7) smtp.mailfrom=bounce@vps-2291.example; dmarc=fail (p=REJECT) header.from=northwindcloud.example",
      ),
      TextBody:
        "Hi Priya,\n\nNorthwind Cloud billing here. We've moved banks. Please pay invoice NW-889 ($362.00) to routing 021000021, account 4400778133 today so your servers stay up.\n\nThanks,\nNorthwind Cloud billing",
    }),
  },
  {
    id: "forged-ceo",
    title: "The forged CEO",
    trick: "It comes from Priya's own address. Priya didn't send it, and her domain says so.",
    shownFrom: "Priya Raman <priya@lumenlabs.example>",
    subject: "urgent - need this today",
    payload: () => ({
      From: "priya@lumenlabs.example",
      FromFull: { Email: "priya@lumenlabs.example", Name: "Priya Raman" },
      Subject: "urgent - need this today",
      MessageID: id(),
      Headers: results(
        "dkim=none; spf=softfail (domain of transitioning priya@lumenlabs.example does not designate 185.22.4.9) smtp.mailfrom=priya@lumenlabs.example; dmarc=fail (p=QUARANTINE) header.from=lumenlabs.example",
      ),
      TextBody:
        "I'm in back-to-back investor meetings and can't talk. Wire $18,000 to Apex Consulting today, it's for the new contract. Don't call, just email me when it's done.\n\nPriya\nSent from my iPhone",
    }),
  },
  {
    id: "diverted-replies",
    title: "The diverted reply",
    trick: "Really from Northwind's address, but replies quietly go to a different domain.",
    shownFrom: "Northwind Cloud <invoices@northwindcloud.example>",
    subject: "Re: Invoice NW-889",
    payload: () => ({
      From: "invoices@northwindcloud.example",
      FromFull: { Email: "invoices@northwindcloud.example", Name: "Northwind Cloud" },
      ReplyTo: "accounts@northwind-remittance.example",
      Subject: "Re: Invoice NW-889",
      MessageID: id(),
      Headers: results(
        "dkim=pass header.d=northwindcloud.example; spf=pass smtp.mailfrom=invoices@northwindcloud.example; dmarc=pass header.from=northwindcloud.example",
      ),
      TextBody:
        "Hi Priya,\n\nInvoice NW-889 for $362.00 is due. Reply to this email to confirm payment and we'll send over the remittance details.\n\nNorthwind Cloud billing",
    }),
  },
  {
    id: "display-name",
    title: "The display-name disguise",
    trick: "Most inboxes show only the name, and the name is Northwind's address. The real one is a Gmail account.",
    shownFrom: "invoices@northwindcloud.example",
    subject: "Invoice NW-889",
    payload: () => ({
      From: "northwind.billing.dept@gmail.com",
      FromFull: { Email: "northwind.billing.dept@gmail.com", Name: "invoices@northwindcloud.example" },
      Subject: "Invoice NW-889",
      MessageID: id(),
      Headers: results(
        "dkim=pass header.d=gmail.com; spf=pass smtp.mailfrom=northwind.billing.dept@gmail.com; dmarc=pass header.from=gmail.com",
      ),
      TextBody:
        "Hello,\n\nPlease pay invoice NW-889 ($362.00) to our new account: routing 021000021, account 4400778133.\n\nNorthwind Cloud",
    }),
  },
  {
    id: "pdf-bank-change",
    title: "The invoice PDF",
    trick: "A lookalike domain, a real-looking PDF with new bank details, and a hidden note telling AI to skip checks.",
    shownFrom: "Northwind Cloud <billing@northwind-cloud.example>",
    subject: "Invoice NW-889 attached",
    payload: () => ({
      From: "billing@northwind-cloud.example",
      FromFull: { Email: "billing@northwind-cloud.example", Name: "Northwind Cloud" },
      Subject: "Invoice NW-889 attached",
      MessageID: id(),
      Headers: results(
        "dkim=pass header.d=northwind-cloud.example; spf=pass smtp.mailfrom=billing@northwind-cloud.example; dmarc=pass header.from=northwind-cloud.example",
      ),
      TextBody: "Hi Priya,\n\nPlease find invoice NW-889 attached. Note our payment details have changed.\n\nNorthwind Cloud",
      Attachments: [
        {
          Name: "northwind-invoice-nw-889.pdf",
          ContentType: "application/pdf",
          Content: NORTHWIND_LOOKALIKE_INVOICE_PDF,
          ContentLength: Math.floor((NORTHWIND_LOOKALIKE_INVOICE_PDF.length * 3) / 4),
        },
      ],
    }),
  },
];

export function emailAttack(attackId: string): EmailAttack | null {
  return EMAIL_ATTACKS.find((a) => a.id === attackId) ?? null;
}
