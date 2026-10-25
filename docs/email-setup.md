# Email setup (Postmark Inbound)

Countersign reads email; it never sends any. Mail to the inbound address becomes a case on the same
pipeline as calls and chat (`convex/channels/email.ts`).

## 1. Postmark (about 5 minutes, free)

1. Sign up at postmarkapp.com and create a server named **Countersign**.
2. Open **Default Inbound Stream → Settings** and copy the inbound address (`<hash>@inbound.postmarkapp.com`).
3. Set the webhook secret on Convex and print the webhook URL. Run this in your own terminal; the secret never goes in chat or the repo:

   ```bash
   S=$(openssl rand -hex 24); npx convex env set EMAIL_WEBHOOK_SECRET "$S"
   echo "https://countersign:$S@<deployment>.convex.site/email/inbound"; unset S
   ```

4. Paste that URL into the stream's **Webhook URL** and save. Postmark sends it as HTTP Basic credentials, and the endpoint compares them in constant time.
5. Send yourself a test: email the inbound address from Gmail. The case appears in the War Room within seconds, with an **Authenticated · SPF ✓ DKIM ✓ DMARC ✓** badge.

To show the address on `/try`, the judge card and the landing page, set it on Vercel as a **Config** variable (it isn't secret) and redeploy:

```
NEXT_PUBLIC_EMAIL_ADDRESS=<hash>@inbound.postmarkapp.com
```

## 2. What happens to an email

| Step | Where |
| --- | --- |
| Webhook auth (Basic, constant time); 503 until `EMAIL_WEBHOOK_SECRET` is set | `convex/channels/email.ts` |
| Parse: sender, subject, text (quoted history dropped), first PDF under 2 MB, dedupe on `MessageID` | `shared/email/inbound.ts` |
| Authentication from the **topmost** `Authentication-Results` / `Received-SPF` / `X-Spam-Tests` only | `shared/email/auth.ts` |
| Forward from the owner: the original sender is used, with verdict `unknown` (a quoted From line proves nothing) | `parseForward` |
| PDF stored in Convex file storage; Claude reads it in intake as an untrusted document | `convex/agents/intake.ts`, `convex/lib/claude.ts` |
| An address counts as on file only if authenticated; a known address that fails is a forgery (R17 BLOCK) | `shared/verification/verifyVendor.ts`, `shared/policy/engine.ts` |
| Reply: written as usual, shown in the War Room as a **draft, not sent** | `app/components/Incoming.tsx` |

Public queries show only the sender's domain (`…@gmail.com`), never the name part, the display name or the message id.

## 3. The /try email attacks

Five crafted payloads (`shared/email/attacks.ts`): the forged vendor, the forged CEO, the diverted reply, the display-name disguise and the invoice PDF. A judge can't forge DMARC from their own inbox, so these come with the receiving server's headers already written. They go through the same parser and pipeline and are labelled **Simulated**.

- Each names Northwind or the owner, whose numbers on file are fictional, so firing one never rings a real phone.
- Visitors are limited to 5 a minute.
- The PDF lives at `public/demo/email/northwind-invoice-nw-889.pdf`, with the same bytes base64-encoded in `shared/email/attackPdf.ts`.

From the CLI:

```bash
npx convex run channels/email:simulateAttack '{"attack":"forged-vendor","senderId":"cli-test-0001"}'
```

## 4. Limits

- Postmark's free plan receives 100 emails a month.
- Mail from a domain with no SPF/DKIM/DMARC (like the seed's `*.example` vendors) is `unknown`, not `pass`: it never counts as on file, so a callback confirms it.
- After judging, run `npx convex run privacy:purgeCallerNumbers`. It also strips email senders down to their domain.
