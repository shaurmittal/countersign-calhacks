# Devpost write-up and demo video

The Devpost submission text (due Sunday 9:00 AM; submit by 8:30). Facts checked against main: 18 rules,
1,126 tests, "39 scenarios · 26/26 scams blocked · 13/13 legitimate paid or correctly escalated · 0 false
PAY" (`npm run scenarios`). The $2.77B figure comes from coverage of the FBI's 2024 IC3 report; check it
against the FBI's PDF before citing the exact number.

## Tagline
The second signer a one-person company never had. You can talk it into anything except moving money.

## Inspiration
In any real company, no one sends money alone. One person requests a payment and another approves it, so a scammer has to fool two people. A solo founder has no second person. The same tired person who reads "our bank changed, please pay today" at 11 PM is the one who pays it.

The attacks are getting better fast. Business email compromise cost US victims about **$2.77 billion in 2024**, the FBI's second-costliest cybercrime category. In 2024 a finance worker at the engineering firm Arup wired about **$25 million** after a video call in which every other participant, the CFO included, was a deepfake. Voice cloning turns "it's your cofounder, wire $25k before my flight" into a real-sounding phone call. Vendors' billing agents can now message your AI agent directly. We wanted the founder to get a second signer back, one that never gets tired and can't be sweet-talked.

## What it does
Every request for money to leave the business goes through Countersign first, on whatever channel it arrives: a call to its own phone number, an email (forwarded invoices and PDFs welcome), or web chat.

- **Real bills get paid automatically:** known vendor, bank details on file, open invoice, normal amount.
- **Anything new or odd is checked out of band.** Countersign phones the vendor back on the number already on file, never a number from the request.
- **Unverifiable requests are refused,** politely and firmly, even when the caller claims to be the owner.
- **Only the real owner can override,** with a code from her authenticator app. Large amounts get a cooling-off window she can still cancel in. A voice never counts.
- **The bank itself needs Countersign's signature.** Lumen Bank, our sandbox bank, only moves money for a transfer the Policy Engine has signed. A hijacked agent that calls the bank directly gets "No countersignature". Try it on `/bank`.
- **Everything is visible and tamper-evident.** The War Room shows every agent working on a case live, and each step goes into a hash-chained audit log the page re-verifies in real time.

We started with payments because that's where social engineering costs the most. The same pipeline (parse, verify out of band, decide in code) can guard any action you can't undo.

## How we built it
**The core idea: the models talk; only code can pay.** Language models read, reason, call and reply, but none of them can move money. The only path to a payment is the **Policy Engine**, a deterministic TypeScript function with **18 unit-tested rules** and no model or network calls. The Payer runs only when it returns PAY.

- **Claude** turns every untrusted message into a strict schema. It flags injection attempts instead of obeying them, reads attached PDF invoices as data, and writes each reply behind a guard that blocks replies promising more than the engine decided.
- **Cartesia** runs the voice agent that answers the business line and the outbound callback to the real vendor.
- **Convex** stores every case, agent run and audit event. It also runs the pipeline, the cooling-off timers and a watchdog that restarts stalled runs, and streams each agent step to the War Room live.
- **Lumen Bank,** our sandbox bank:
  - On PAY, the Payer signs exactly one transfer (who, how much, which invoice) with ECDSA P-256. The signature is single-use and expires in two minutes, and the bank checks it against the public key before moving a cent.
  - A bank-detail change freezes the payee until the vendor confirms by phone and the owner approves with her code.
- **Email** through Postmark Inbound: the receiving server's real SPF, DKIM and DMARC results decide whether a From address can count as a vendor or as the owner (rule R17). Countersign never sends email; its replies are drafts.
- **Moss** powers vendor-book search. **CRS** (AtData Fraud Finder) scores the email address of any sender not in the vendor book, and a high risk score sends the request to the owner.
- **Increase** sandbox ACH and a double-entry mock ledger serve as alternative payment rails. Idempotency keys mean a retry can never pay twice.
- **Front end:** Next.js and React, with one design system across the War Room, the owner's approval page, the bank and the try-it chat, deployed on Vercel.

## Challenges we ran into
- **Making a jailbroken agent harmless by design, not by prompt.** We assumed every model could be talked into anything, then made sure no model output can ever reach the money path.
- **Approving a payment without SMS.** We used authenticator-app codes (RFC 6238) with a replay guard and a lockout. An approval proves the owner holds her device, not just that someone knows her phone number.
- **Keeping everything real.** Every lane, number and badge in the War Room is a database row written by the agent that did the work. "Dollars lost" is computed from actual payments.
- **Trusting email without being fooled by it.** Anyone can type any From address, so we rely on what the receiving mail server proved, not what the header claims.
- **Failures under real load.** Live rehearsals exposed runs dying halfway through. We added an atomic payment lock so nothing is ever paid twice, and a watchdog that restarts stalled cases.

## Accomplishments that we're proud of
- **A 39-scenario answer key that runs in CI:** 26 of 26 scams blocked, 13 of 13 legitimate bills paid or correctly sent to the owner, and **zero wrong payments**, backed by **1,126 automated tests**.
- **Countersigned transfers:** even an attacker with direct access to the bank's API can't move money. All four live attacks on `/bank` are refused: no signature, a forged key, an edited transfer and a replayed one.
- **Email that can't be faked into authority:** a forged vendor or owner address is refused using real SPF, DKIM and DMARC results, and a malicious PDF invoice is read without being obeyed.
- **A War Room anyone can follow:** watch each agent light up, the verdict land and the audit chain verify itself, live.

## What we learned
- **Put the guardrail outside the model.** A prompt is a suggestion; a tested pure function is a guarantee. Separating who talks from who decides made the system easier to reason about and to test.
- **Out-of-band verification beats detection.** One callback to the number on file defeats spoofed caller ID, cloned voices and hijacked email threads at once.
- **The trust signals already exist.** Mail servers report SPF, DKIM and DMARC on every message, and most tools ignore them.
- **Show your work.** Making every step visible built more trust than any claim could.

## What's next for Countersign
The same pipeline (parse, verify out of band, decide in code, require a second signer) can guard any action you can't undo:
- bank and payroll changes;
- password and MFA resets;
- sharing sensitive documents;
- granting account access;
- the actions AI agents take on our behalf.

Each new action type brings its own schema, rules and verification step. The channels, sender checks, callbacks, owner approval and audit chain stay the same.

Next on the roadmap:
- bank feeds and accounting sync;
- a production payment rail, with the signer in its own isolated service;
- SOC 2-style access controls;
- a vendor-side Countersign, so two companies' agents can verify each other.

## Built with

Claude, Cartesia, Convex, Postmark, Moss, CRS (AtData), Increase, Next.js, React, TypeScript, Tailwind CSS, Framer Motion, Vercel.

Sources for the numbers: [Nacha on the FBI IC3 report](https://www.nacha.org/news/fbis-ic3-finds-almost-85-billion-lost-business-email-compromise-last-three-years), [Proofpoint on 2024 losses](https://www.proofpoint.com/us/blog/email-and-cloud-threats/email-attacks-drive-record-cybercrime-losses-2024), [CNN on the Arup deepfake](https://abc17news.com/money/cnn-business-consumer/2024/05/16/british-engineering-giant-arup-revealed-as-25-million-deepfake-scam-victim/).

## Demo video (3 minutes max, opens with the moment)

| Time | Shot | Say |
| --- | --- | --- |
| 0:00-0:20 | War Room + a phone ringing out loud: the Callback Verifier calls "Pixel & Pine" (teammate B). B: "No, we never sent that." Lane turns red, BLOCK. | "Someone texted our founder 'our bank changed.' Countersign called the real vendor back on the number on file. They never sent it." |
| 0:20-0:40 | Rewind to the incoming message; lanes lighting up: intake, vendor match, bank differs, R2 callback required. | "A solo founder has no second signer. Countersign is that second signer." |
| 0:40-1:00 | Happy path: Northwind invoice auto-paid; payment ID and journal lines on the Payer lane. | "It isn't a blocker. Known bills just get paid." |
| 1:00-1:35 | Harbor Legal $12,000: ESCALATE. Priya's phone: `/owner`, authenticator code, Approve. Cooling-off countdown, then PAY. Repeat with Cancel during cooling-off: BLOCK. | "Large payments need the owner's device, not her voice. And she can still cancel." |
| 1:35-2:05 | Someone calls claiming to be Priya: "I'm locked out, approve it now." Voice agent holds the line; R11. | "You can talk it into anything except moving money." |
| 2:05-2:35 | Scoreboard, "Audit chain verified", the 30-scenario result. | "The models talk. Only deterministic code can pay." |

