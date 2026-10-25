<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/countersign-lockup-white.svg">
    <img src="docs/brand/countersign-lockup.svg" alt="Countersign" height="84">
  </picture>
</p>

<h3 align="center">The second signer a one-person company never had.</h3>

<p align="center">
  You can talk it into anything except moving money. AI agents answer the phone, read every payment
  request and call the real vendor back; only a deterministic Policy Engine can release a payment, and
  the bank moves money only for a transfer that engine countersigned.
</p>

<p align="center">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-111214?style=flat-square">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-111214?style=flat-square">
  <img alt="TypeScript 7" src="https://img.shields.io/badge/TypeScript-7-111214?style=flat-square">
  <img alt="Convex 1.48" src="https://img.shields.io/badge/Convex-1.48-111214?style=flat-square">
  <img alt="Claude Opus 5.5" src="https://img.shields.io/badge/Claude-Opus%205.5-111214?style=flat-square">
  <img alt="Cartesia voice" src="https://img.shields.io/badge/voice-Cartesia-111214?style=flat-square">
  <img alt="1,126 tests" src="https://img.shields.io/badge/tests-1%2C126%20passing-111214?style=flat-square">
  <img alt="0 false PAY" src="https://img.shields.io/badge/answer%20key-0%20false%20PAY-111214?style=flat-square">
</p>

<p align="center">
  <a href="docs/spec.md"><b>Spec</b></a> ·
  <a href="docs/judge-qa.md"><b>Judge Q&amp;A</b></a> ·
  <a href="docs/devpost.md"><b>Devpost</b></a> ·
  <a href="docs/cartesia-setup.md"><b>Voice setup</b></a> ·
  <a href="docs/email-setup.md"><b>Email setup</b></a> ·
  <a href="DESIGN.md"><b>Design system</b></a> ·
  <a href="docs/brand/README.md"><b>Brand</b></a>
</p>

<p align="center">
  <img src="docs/images/war-room-calling-the-vendor.png" alt="The War Room: a 'our bank changed' request on hold while the Callback Verifier phones the vendor on the number already on file; the Policy Engine has said HOLD and the Payer was never called" width="860">
  <br>
  <sub>The War Room during a real case: someone claiming to be Pixel &amp; Pine asked for invoice 1042 to go to a new
  account. Intake, the Vendor Verifier and the Risk Analyst have run, the Policy Engine said HOLD (R3, R6), and the
  Callback Verifier is phoning the vendor on the number <i>already on file</i>. The Payer has not been called.</sub>
</p>

> [!NOTE]
> **Lumen Labs, its owner Priya Raman and its vendors are fictional, and no real money moves**: payments go to
> Lumen Bank, our sandbox bank, or the Increase sandbox. The phone line, the vendor callback, Claude, the email
> authentication results and the owner's authenticator codes are real. The answer-key numbers below come from
> `npm run scenarios` and `npm test` on `main`; the live run is documented in [the judge Q&amp;A](docs/judge-qa.md).

---

## At a glance

<table>
  <tr>
    <td align="center" width="33%">
      <h2>0&thinsp;/&thinsp;39</h2>
      wrong payments in the answer key<br><sub>26/26 scams blocked, 13/13 real bills paid or sent to the owner<br>
      <a href="scenarios/scenarios.json">scenarios.json</a> · <code>npm run scenarios</code></sub>
    </td>
    <td align="center" width="33%">
      <h2>18</h2>
      rules in one pure function, the only code that can say PAY<br><sub>no model, no network, a test per rule<br>
      <a href="shared/policy/engine.ts">engine.ts</a> · <a href="shared/policy/engine.test.ts">engine.test.ts</a></sub>
    </td>
    <td align="center" width="33%">
      <h2>1,126</h2>
      automated tests, 38 files<br><sub>engine, pipeline (convex-test), bank, email, voice, owner codes<br>
      <code>npm test</code></sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <h2>4&thinsp;/&thinsp;4</h2>
      hijacked-agent transfers refused by the bank<br><sub>no signature, a forged key, an edited and a replayed transfer<br>
      <a href="convex/bank.test.ts">bank.test.ts</a> · live on <code>/bank</code></sub>
    </td>
    <td align="center">
      <h2>28&thinsp;/&thinsp;28</h2>
      scenarios through a deployed pipeline, 0 false PAY<br><sub>real Claude intake, before email landed<br>
      <a href="docs/judge-qa.md">judge Q&amp;A</a> · <code>npm run rehearse</code></sub>
    </td>
    <td align="center">
      <h2>2&thinsp;min</h2>
      life of a countersignature, single use<br><sub>ECDSA P-256 over exactly one transfer<br>
      <a href="shared/bank/payload.ts">payload.ts</a> · <a href="shared/bank/verify.ts">verify.ts</a></sub>
    </td>
  </tr>
</table>

## The problem

In any real company no one sends money alone: one person requests a payment and another approves it, so a
scam has to fool two people. **A solo founder has no second person.** The same tired person who reads "our bank
changed, please pay today" at 11 PM is the one who pays it. Voice cloning turns "it's your cofounder, wire $25k
before my flight" into a convincing phone call, and vendors' billing agents can now message your agent directly.

Countersign is that second signer. Every request for money to leave the business goes through it first, on any
channel. Known bills are paid on their own. Anything new or odd is verified out of band, by calling the vendor
back on the number already on file. Unverifiable requests are refused, politely and firmly, even from someone
claiming to be the owner. The real owner can override, but only with a code from her authenticator app.

## How a request is decided

```mermaid
flowchart LR
    A["Phone · email · web chat<br/>agent channel"] --> B["cases.open"]
    B --> C["Intake Parser<br/>Claude reads untrusted text"]
    C --> D["Vendor Verifier ∥<br/>Risk Analyst"]
    D --> E["Policy Engine<br/>decide(): plain code, 18 rules"]
    E -->|"HOLD + callback"| F["Callback Verifier<br/>calls the number on file"]
    F --> E
    E -->|"ESCALATE"| G["Owner<br/>authenticator code"]
    G --> E
    E -->|"PAY"| H["Payer<br/>signs one transfer"]
    H --> I["Lumen Bank<br/>checks the countersignature"]
    E -->|"BLOCK / HOLD /<br/>not a payment"| J["Reply on the same channel"]
    E -.->|"every step"| K["Hash-chained audit log<br/>re-verified in the War Room"]
```

**The models talk; only code can pay.** Claude reads each request into a strict schema and writes every reply,
behind a guard that rejects replies promising more than the engine decided. The Vendor Verifier and the Risk
Analyst gather findings. None of them can move money: the only path to the Payer is `decide()` in
[`shared/policy/engine.ts`](shared/policy/engine.ts) returning PAY, and the Payer then signs exactly one transfer
that Lumen Bank verifies with the public key before moving anything. A jailbroken agent can only say the wrong
thing.

<details>
<summary><b>The pipeline step by step</b> (<code>convex/pipeline.ts</code>)</summary>
<br>

```
channel webhook ──► cases.open ──► pipeline.advance
                                     1. intake            → case.request
                                     2. vendorVerifier ∥ riskAnalyst → findings
                                     3. decide()  (no LLM) → policyResult
                                     4. needs.callback?  → schedule callbackVerifier.start, CALLBACK_PENDING
                                        PAY?             → payer, CLOSED
                                        needs.ownerOtp?  → schedule ownerConcierge.requestApproval, AWAITING_OWNER
                                        else             → CLOSED
                                     reply → channels/reply.dispatch
callbackVerifier.recordOutcome ──► pipeline.advance   (re-runs; reads the outcome)
owner approval / cooling-off   ──► pipeline.advance
```

`advance` is idempotent: it skips steps whose output is already on the case, so any external event can simply
re-run it. A watchdog restarts a run that dies mid-way (at most twice), then closes the case as HOLD and alerts
the owner.
</details>

## What must never happen

| | Invariant | Enforced by |
|---|---|---|
| I1 | Nothing but the Policy Engine's PAY reaches the Payer, and PAY needs R12's positive checks | [`engine.test.ts`](shared/policy/engine.test.ts): *only R12 ever produces PAY*, *never pays on missing data* |
| I2 | Only the Payer can sign a transfer, and only `countersign.ts` reads the private key | [`countersign.test.ts`](convex/lib/countersign.test.ts): *only the Payer imports or calls signRelease*, *only countersign.ts reads the private key* |
| I3 | The bank refuses any transfer without a valid, unused countersignature, and fails closed without a key | [`bank.test.ts`](convex/bank.test.ts): *rejects all four attempts…*, *no signing key -> nothing moves*; [`verify.test.ts`](shared/bank/verify.test.ts) |
| I4 | A case is paid at most once, even when two runs race | [`pipeline.test.ts`](convex/pipeline.test.ts): *two pipeline runs racing on an approved case pay exactly once* |
| I5 | The callback dials the number already on file, never one from the request, and a denial blocks | [`pipeline.test.ts`](convex/pipeline.test.ts): *bank change, vendor denies on callback -> BLOCK…* |
| I6 | A bank-detail change never pays anything | [`engine.test.ts`](shared/policy/engine.test.ts): *a Lumen Bank change request… never PAYs*; [`bankChange.test.ts`](convex/bankChange.test.ts) |
| I7 | Gift cards, crypto, already-paid invoices and requests for sensitive data are refused even with the owner's approval | [`engine.test.ts`](shared/policy/engine.test.ts): *R9 forbidden rail -> BLOCK, not overridable…*, *R13 already paid…* |
| I8 | An injection attempt is never auto-paid | [`engine.test.ts`](shared/policy/engine.test.ts): *R15 injection attempt -> never auto-paid* |
| I9 | A forged From address never counts as a vendor or the owner | [`auth.test.ts`](shared/email/auth.test.ts): *fails a forged From: DMARC fail for the vendor's domain*; R17 scenarios |
| I10 | An owner code works once, and wrong codes lock | [`totp.test.ts`](shared/totp.test.ts): *rejects a replay…*; [`senderLists.test.ts`](convex/senderLists.test.ts), [`bankChange.test.ts`](convex/bankChange.test.ts) |
| I11 | Editing or deleting any audit event is detected | [`audit.test.ts`](shared/audit.test.ts): *detects an edited payload*, *detects a deleted event* |

Answers for "what happens if…", each with its rule and test: [`docs/judge-qa.md`](docs/judge-qa.md).

## Results

### The 39-scenario answer key

Every attack and every real bill in [`scenarios/scenarios.json`](scenarios/scenarios.json), run through the real
Policy Engine with the reference verifier (`npm run scenarios`, also in CI):

| | Scenarios | Outcome |
|---|---|---|
| **Scams** | 26: bank-change calls (incl. Spanish and spoofed caller ID), owner and cofounder impersonation, lookalike vendors and invoices, payroll redirects, gift cards, crypto, prompt injection, duplicate invoices, OFAC, forged and spoofed email | **26 / 26 blocked or held**, never paid |
| **Real bills** | 13: known vendors on file, an owner-approved bank change, a confirmed new number, authenticated email, forwarded invoices | **13 / 13 paid or correctly sent to the owner** |
| **Wrong payments** | | **0** |

<details>
<summary><b>Every scenario and the rules that fired</b></summary>
<br>

| Scenario | Decision | Rules |
|---|---|---|
| `pixel-bank-change-denied` | BLOCK | R2, R3, R6, R10 |
| `pixel-bank-change-no-answer` | HOLD | R2, R3, R6 |
| `pixel-bank-change-spoofed-caller-id` | BLOCK | R2, R6, R10 |
| `pixel-bank-change-spanish` | BLOCK | R2, R3, R6, R10 |
| `owner-impersonation` | BLOCK | R1, R11 |
| `owner-wire-before-flight` | BLOCK | R2, R4, R5, R6, R7, R10, R11 |
| `cofounder-wire` | BLOCK | R1 |
| `aws-lookalike` | BLOCK | R1 |
| `google-workspace-lookalike` | BLOCK | R1 |
| `northwind-lookalike-invoice` | BLOCK | R3, R5, R10 |
| `franchise-tax-notice` | BLOCK | R1 |
| `payroll-redirect` | BLOCK | R2, R3, R10 |
| `gift-cards` | BLOCK | R1, R9 |
| `gift-cards-from-owner` | BLOCK | R1, R9, R11 |
| `crypto-payment` | BLOCK | R3, R6, R9 |
| `injection` | BLOCK | R1, R15 |
| `injection-known-vendor` | BLOCK | R2, R10, R15 |
| `duplicate-invoice` | BLOCK | R13 |
| `amount-anomaly` | HOLD | R4, R5, R6, R7 |
| `ofac-hit` | BLOCK | R1, R8 |
| `northwind-happy` | PAY | R12 |
| `sam-weekly` | PAY | R12 |
| `northwind-from-vendor-on-file` | PAY | R12 |
| `sam-new-number-confirmed` | PAY | R3, R12 |
| `pixel-needs-owner-otp` | ESCALATE | R6 |
| `genuine-bank-change-confirmed` | ESCALATE | R2, R6 |
| `genuine-bank-change-approved` | PAY | R2, R6, R12 |
| `harbor-legal-always-escalates` | ESCALATE | R6 |
| `crs-outage` | ESCALATE | R14 |
| `hello` | NO_ACTION | |
| `email-forged-vendor-bank-change` | BLOCK | R2, R3, R6, R17 |
| `email-forged-owner-wire` | BLOCK | R1, R11, R17 |
| `email-forged-vendor-invoice` | BLOCK | R3, R17 |
| `email-reply-to-diverted` | HOLD | R17 |
| `email-display-name-spoof` | HOLD | R2, R3, R6, R17 |
| `email-unverifiable-vendor-address` | HOLD | R2, R3, R6 |
| `email-authenticated-vendor-pays` | PAY | R12 |
| `email-forwarded-by-owner-confirmed` | ESCALATE | R3, R6 |
| `email-reply-to-confirmed` | PAY | R12, R17 |

`npm run eval:intake` runs the same scenarios through real Claude intake, and `npm run rehearse` through a deployed
pipeline (it wipes that deployment; setup in `scripts/live-scenarios.ts`).
</details>

### The bank refuses a hijacked agent

<p align="center">
  <img src="docs/images/lumen-bank-hijacked-agent.png" alt="Lumen Bank: four requests sent straight to the bank's public endpoint, each rejected: no countersignature, countersignature invalid twice, countersignature already used" width="760">
  <br>
  <sub><code>/bank</code>: "Simulate a hijacked agent" sends four real requests to the bank's public endpoint, skipping
  Countersign. No signature, a key the page just made, a real countersignature with the amount edited, and a real
  one replayed: all four refused, nothing moves.</sub>
</p>

## Try it

- **Call the line,** <b>+1 (256) 215-6932</b>: the Cartesia voice agent takes the request and holds the line while
  Countersign verifies it. Calls from anywhere work.
- **Type at `/try`:** five attacks and a real bill one click away, plus five forged-email attacks (crafted headers,
  labelled "Simulated", through the real parser). `/try?new` starts a fresh conversation.
- **Email** the Postmark inbound address: forward an invoice or attach a PDF. Countersign never sends email; its
  reply is an unsent draft in the War Room ([setup](docs/email-setup.md)).
- **Watch it** in the War Room (`/`), **approve it** on `/owner` with the authenticator code, and **attack the bank**
  on `/bank`.

<details>
<summary><b>The owner's page and the chat</b></summary>
<br>
<p align="center">
  <img src="docs/images/owner-approvals.png" alt="Owner approvals: a $1,500 Harbor Legal payment waiting for the authenticator code, a bank-detail change waiting for approval, and the alerts timeline" width="760">
  <br><br>
  <img src="docs/images/try-it-chat.png" alt="The /try chat: a bank-change request, the verification steps, and Countersign's reply that it is calling the vendor on the number on file" width="760">
</p>
</details>

## Policy rules ([`shared/policy/engine.ts`](shared/policy/engine.ts))

Strongest effect wins: **BLOCK > HOLD > ESCALATE > PAY**. An owner OTP approval satisfies ESCALATE only; it never
lifts a BLOCK or HOLD. PAY requires R12's positive checks, not just "no rule fired".

| Rule | Fires when | Effect |
| --- | --- | --- |
| R1 | No vendor-book match | BLOCK |
| R2 | New bank details (or change_bank / update_payroll) | HOLD + callback → confirmed: ESCALATE → OTP: PAY (vendor record updated, audited). no_answer: HOLD |
| R3 | Sender not on file claims to be the payee (vendor or employee), or asks to change the payee's bank or payroll details | HOLD + callback → confirmed: OK, no_answer: ESCALATE |
| R4 | Amount >25% outside typical range | ESCALATE |
| R5 | No open invoice matching number/amount | HOLD |
| R6 | Over auto-pay limit, or vendor `alwaysEscalate` | ESCALATE |
| R7 | Over cooling-off threshold | ESCALATE, then HOLD until `coolingOffUntil` |
| R8 | OFAC hit (no live source: the team's CRS account has no OFAC product) | BLOCK, not overridable |
| R9 | Gift cards / crypto | BLOCK, not overridable |
| R10 | Callback denied | BLOCK; sender marked known-bad |
| R11 | Sender claims to be the owner | ESCALATE (the claim is worth nothing; real owner approves via OTP) |
| R12 | Known vendor, open invoice, amount matches, nothing else blocking | PAY |
| R13 | Invoice already paid | BLOCK, not overridable |
| R14 | Parse failure, several payments in one message, verifier/risk didn't run, non-USD (HOLD); CRS unavailable, or a high email-risk score for a sender not on file (ESCALATE) | HOLD / ESCALATE |
| R15 | Injection attempt (model OR regex prescan) | ESCALATE: never auto-paid |
| R16 | The sender's phone, email or domain, a domain in the message, or the bank account is on the owner's deny list | BLOCK (the owner removes the entry to allow it) |
| R17 | Email only. The From address is a vendor's or the owner's but failed authentication (forged) | BLOCK |
| R17 | Email failed authentication for its own domain, or its display name poses as another address | ESCALATE |
| R17 | Replies go to a different domain than the sender's | HOLD + callback → confirmed: OK, no_answer: ESCALATE |
| R18 | The message asks for passwords, one-time codes, tax forms, SSNs, card or employee data, or to log in through a link | BLOCK, not overridable |

**Messages that ask for no money** are triaged by the Intake Parser (meeting, question, vendor update, invoice
question, sales or spam, phishing, data request). Claude writes a reply to what was actually asked, the owner gets
a one-line summary, and spam is filtered without bothering them. The War Room shows FORWARDED or FILTERED.
Phishing and data requests are refused by R18.

An email address counts as on file (R3) only when the receiving mail server says its domain sent it: DMARC pass,
or DKIM/SPF pass aligned with the From domain. Only the topmost authentication headers count, because anything
further down travelled with the message and the sender could have written it. This is checked in the Vendor
Verifier and again inside `decide()`.

<details>
<summary><b>The owner's block and trust lists</b></summary>
<br>

The owner manages two lists on `/owner` (`convex/senderLists.ts`, matching in `shared/verification/lists.ts`):

- **Block (deny):** a phone number, email, domain or bank account (routing + last 4). Any hit is R16 BLOCK. An
  approval can't lift it, like every BLOCK.
- **Trust:** ties one phone, email or domain to one vendor. It makes `senderOnFile` true, which satisfies R3, and
  nothing else. R2's callback for bank changes, the amount, invoice, limit and CRS checks all still apply, so a
  trust entry can never move money on its own. A deny entry for the same sender wins.
- **Only the owner edits them,** with a code from the authenticator app, checked like an approval (TOTP plus replay
  guard), with its own lockout after 5 wrong codes. Never over chat, voice or the agent channel: "please add my
  new number" is exactly what a scammer would send.
- Every change and every rejected code is an audit event. Values leave the backend masked, and
  `privacy:purgeCallerNumbers` masks listed phone numbers too.
- `vendors.knownBadSenders` (written by R10 after a denied callback) is listed on `/owner` too, read-only.
</details>

## Run it locally

Needs a Convex account; the live channels also need Claude, Cartesia, Postmark, Moss and CRS keys.

```bash
npm install
npx convex dev          # first run: log in, then ONE person creates the "countersign" project,
                        # everyone else picks the same project. Writes .env.local.
npm run seed            # loads the fictional Lumen Labs world
npm run dev             # War Room at http://localhost:3000 (second terminal)
npm test                # 1,126 tests: Policy Engine, pipeline, bank, email, voice, owner codes
npm run scenarios       # prints the answer-key table and the pitch line (no API calls)
npm run eval:intake     # the same 39 scenarios through real Claude intake (needs ANTHROPIC_API_KEY locally)
npm run rehearse        # the same 39 scenarios through a DEPLOYED dev pipeline (wipes it)
npm run typecheck
```

Each person can use their own Convex dev deployment (default with `npx convex dev`), so you don't overwrite each
other's data; use one shared deployment for the demo. Secrets go in Convex env vars
(`npx convex env set NAME value`), never in the repo: see [`.env.example`](.env.example). Lumen Bank's signing and
verify keys come from `npm run keygen:countersign`.

Push a message through the pipeline without a phone (or open <http://localhost:3000/try>):

```bash
npx convex run cases:open '{"channel":"web","fromAddress":"+15555550199","rawContent":"Pay Northwind #NW-889"}'
```

## Repository map

| Path | What it is |
|---|---|
| [`shared/policy/`](shared/policy) | The Policy Engine: `decide()`, the only code that can return PAY, and a test per rule |
| [`shared/`](shared) | Pure TypeScript shared by Convex, tests and the browser: intake schema and prescan, reply guard, audit hashing, TOTP, ledger, Lumen Bank's payload and checks, email authentication |
| [`convex/pipeline.ts`](convex/pipeline.ts) | The leader: `advance(caseId)`, idempotent, with a watchdog |
| [`convex/agents/`](convex/agents) | Intake, Vendor Verifier, Risk Analyst, Callback Verifier, Owner Concierge, Payer |
| [`convex/channels/`](convex/channels) | Voice (Cartesia tools), web chat, email (Postmark), WhatsApp, the agent bridge, replies |
| [`convex/bank.ts`](convex/bank.ts), [`convex/lib/countersign.ts`](convex/lib/countersign.ts) | Lumen Bank, and the only signer of transfers |
| [`app/`](app) | The War Room (`/`), `/owner`, `/bank`, `/try` (one design system in `app/ui/`) and the `/demo` landing film |
| [`scenarios/`](scenarios) | The 39-scenario answer key and the reference verifier |
| [`scripts/`](scripts) | Live intake eval, live rehearsal, owner TOTP enrollment, countersign keygen |
| [`fetch-agents/`](fetch-agents) | Python agents for the agent channel: Countersign and a demo vendor billing agent |
| [`video/`](video) | The demo video: Playwright recordings of the real app, a Cartesia Sonic voiceover, Remotion |
| [`docs/`](docs) | Spec, judge Q&amp;A, Devpost write-up, voice and email setup, brand |

<details>
<summary><b>Every file and its owner</b></summary>
<br>

```
shared/                     pure TS, no Convex imports, runs in tests/Convex/browser
  types.ts                  ★ the contract: PaymentRequest, findings, PolicyInput/Result
  config.ts                 demo policy values and limits
  policy/engine.ts          P1  Policy Engine: the ONLY code that can return PAY
  policy/engine.test.ts     P1  one test per rule
  intake/                   P1  prescan (regex signals), Claude output schema, prompts
  reply.ts                  P1  reply templates + guard that rejects over-promising replies
  audit.ts                  P1  hash-chain helpers (sorted-key canonical JSON)
  totp.ts                   P4  owner step-up code check (RFC 6238, replay guard)
  ledger.ts                 P4  double-entry journal lines per payment
  bank/payload.ts           P1  countersigned release payload: canonical JSON, ECDSA P-256 sign/verify
  bank/verify.ts            P1  Lumen Bank's transfer checks, in order (pure, unit-tested)
  scoreboard.ts             P4  scoreboard definitions (scam attempt, dollars lost, decision time)
  whatsapp.ts               P2  WhatsApp webhook handshake, signature check, payload parsing, E.164
convex/
  schema.ts                 P1  tables (spec §4)
  pipeline.ts               P1  leader: `advance(caseId)` step function
  cases.ts                  P1  `open` (entry point for every channel), update, UI queries
  audit.ts                  P1  hash-chained audit log + verifyChain
  agentRuns.ts                  start/finish rows that drive the War Room lanes
  lib/withAgentRun.ts           wrap any agent step so it shows up in the War Room
  agents/intake.ts          P1  Claude → PaymentRequest
  lib/claude.ts             P1  Claude calls (intake + reply); no Convex imports, shared with scripts/
  agents/vendorVerifier.ts  P3  vendor book (Moss), CRS email screening (AtData Fraud Finder)
  agents/riskAnalyst.ts     P3  red flags + Claude explanation
  agents/callbackVerifier.ts P2 Cartesia outbound call to phoneOnFile; outcome, retry, timeout
  agents/ownerConcierge.ts  P4  authenticator-code approval (owner page), cooling-off, owner alerts
  agents/payer.ts           P4  Lumen Bank by default; PAYMENT_RAIL=mock or ach_sandbox (Increase) instead
  lib/countersign.ts        P1  signRelease: the only reader of COUNTERSIGN_SIGNING_KEY, called only by the Payer
  bank.ts                   P1  Lumen Bank: transfers (Payer + POST /bank/transfers), payees, bank-detail changes
  payments.ts               P4  payment rows, idempotency, `provisionIncrease` sandbox setup
  owner.ts                  P4  owner page queries (pending approvals, alert feed)
  warRoom.ts                P4  War Room case detail (lanes, callbacks, approvals, payments)
  lib/caseView.ts           P4  masked read helpers shared by the UI queries and the agent bridge
  lib/increase.ts           P4  Increase REST client (fetch, idempotency keys, one retry)
  channels/voice.ts         P2  Cartesia webhook tools (submit request, case status, callback outcome)
  channels/web.ts           P2  web chat channel (replaces SMS), used by app/try
  channels/whatsapp.ts      P2  WhatsApp Cloud API webhook (/whatsapp/webhook): opens cases, never approves
  channels/reply.ts         P2/P4 send replyText back on the original channel
  lib/cartesia.ts           P2  Cartesia API client + tool secret check
  lib/whatsapp.ts           P2  WhatsApp Graph API client (sends text replies; logs failures, never throws)
  channels/agentBridge.ts   P4  agent channel bridge (/agent/message, /agent/case, /agent/pending, /agent/approval)
  http.ts                       HTTP routes (https://<deployment>.convex.site/...)
  seed.ts                   P3  fictional world (spec §7.1)
  senderLists.ts            P3  the owner's block and trust lists: masked list query, add/remove behind an authenticator code
  scoreboard.ts             P4  top-bar numbers
app/                        P4  War Room (Next.js + Convex React hooks)
app/ui/                     P1  the app's design system: shell, tokens, stamps, OTP input (DESIGN.md)
app/owner/                  P4  owner approvals and the block/trust lists, opened on the owner's phone
app/bank/                   P1  Lumen Bank: balance, payees, "Simulate a hijacked agent", live ledger
app/try/                    P2  judge chat page (QR code on the judge card)
app/demo/                   P2  the landing film
scenarios/scenarios.json    P1  the answer key (spec §9)
scenarios/world.ts          P1  seed world as data + reference verifier (what VendorFindings must contain)
scripts/eval-intake.ts      P1  live intake eval
scripts/enroll-owner-totp.ts P4 one-time authenticator enrollment for the owner
fetch-agents/               P4  Python agents for the agent channel: Countersign + a demo vendor billing agent
```

Owner approvals and payments: setup and demo runbook in [`docs/p4-experience.md`](docs/p4-experience.md).
</details>

## How we use the sponsors

<details>
<summary><b>Voice: Cartesia</b> (the verification itself, not a front end)</summary>
<br>

Setup details (prompts, tool configs, numbers) are in [`docs/cartesia-setup.md`](docs/cartesia-setup.md).

**Features used**
- **Managed Agents** (Claude Haiku 5.5, Sonic voice): two production agents. *Countersign Inbound* answers the line
  and holds it during verification. *Countersign Callback* phones the vendor. A third test agent plays the vendor,
  so the whole loop runs agent-to-agent in development.
- **Cartesia phone numbers:** the inbound line, an outbound-only callback number and the test vendor. No other
  telephony provider.
- **Outbound calls API** (`POST /agents/calls`), with per-call `dynamic_variables`. The callback agent learns the
  amount, the vendor and the new account's last 4 at dial time, but deliberately not the invoice number: the vendor
  has to say it.
- **Webhook tools with secret headers**, all served by Convex HTTP actions:
  - `submit_payment_request` and `get_case_status` on the inbound agent. `get_case_status` long-polls, so the agent
    announces the callback once and then waits quietly.
  - `record_callback_outcome` on the callback agent.
  - `lookup_policy` on both agents: a mid-call Moss lookup of Countersign's rules for "why do you need to check?". It
    answers within 2 s, with keyword matching when Moss isn't back in time, and each lookup lands on the case's audit
    trail (`moss · policy.lookup`).
- **System dynamic variables** `system__caller_id` and `system__conversation_id` (tool parameters the model can't
  change), plus an **assignment** that saves `case_id` from a tool response.
- **System tools:** End call on both agents; Voicemail detection on the callback agent, with no message, so payment
  details are never left on voicemail.
- **Get Call API:** after every callback we store the transcript and Cartesia's summary on the case for the War Room
  and the audit trail.

**Known limits**
- Cartesia numbers call **US numbers only**, so the vendor's number on file must be a US number. Inbound calls from
  anywhere work.
- **No SMS:** text requests come in through the web chat (`/try`).
- **The model classifies the vendor's answer.** Code then checks it: "confirmed" only counts if the vendor states the
  matching invoice number. Anything else counts as not verified.
- **Caller ID is never trusted.** Verification is always an outbound call to the number already on file; we never
  call back a number the caller gives.
- **No voice tool can move money.** The worst a jailbroken agent can do is say the wrong thing.
- **Waits:** a callback takes about 30–60 s end to end. Tools time out after 25 s, so long waits arrive as several
  20 s checks.
</details>

<details>
<summary><b>Backend: Convex</b> (the database, every agent step, the timers and the live War Room)</summary>
<br>

**Features used**
- **Reactive queries:** the War Room, `/owner` and `/try` subscribe with `useQuery`. When an agent writes its
  `agentRuns` row, every open screen updates. We wrote no websocket or polling code.
- **Mutations are transactions:** the payment lock (`cases.claimPayment`) and the audit chain (`appendAudit` reads
  the last hash and writes the next) each run in one transaction, so two triggers can't both pay a case or fork the
  chain.
- **Actions** make every outside call (Claude, Cartesia, Moss, CRS, Increase) and write results back through
  mutations, each with an audit event.
- **Scheduler:** the pipeline runs as scheduled steps; the vendor callback retries and times out on timers; after the
  owner approves a large payment, the pipeline schedules its own wake-up at `coolingOffUntil` and pays only if the
  approval still stands.
- **HTTP actions:** Cartesia's webhook tools, the WhatsApp webhook, Lumen Bank's public transfer endpoint and the
  agent bridge, each authenticated (a secret header, or Meta's signature for WhatsApp).
- **Indexes** for every lookup, e.g. cases by `externalId` (dedupes webhook retries), payments by idempotency key,
  audit events by sequence.
- **Node runtime** (`"use node"`) only for the Moss SDK. **Environment variables** hold every key.
- **convex-test:** the pipeline tests run the real pipeline, Policy Engine and audit chain against an in-memory
  Convex backend.

**Known limits**
- Actions aren't transactional. A payment call that times out is retried with the same Increase `Idempotency-Key`,
  so it can't be sent twice.
- `audit.verifyChain` re-reads the whole log whenever it changes: fine for a demo, a production version would
  checkpoint.
- No sign-in: the War Room and `/owner` are public read-only views of fictional data. Approving a payment still
  needs the owner's authenticator code.
</details>

<details>
<summary><b>Team rules and contracts between the parts</b></summary>
<br>

- **Only `decide()` can say PAY.** No model output, tool or webhook moves money directly.
- **The callback number comes from `vendors.phoneOnFile`, read inside the tool.** Never from the request or model
  output.
- **Every agent step goes through `withAgentRun`.** The War Room shows only real runs.
- **Every state change writes an audit event** (`appendAudit` in mutations, `internal.audit.append` from actions).
- **Stubs default to HOLD.** If something is missing or fails, the case holds; it never pays.
- **Changes to `shared/types.ts` or `convex/schema.ts`** go in a small PR of their own; tell the team.
- Work on branches and merge to `main` often. Keep `main` passing `npm run typecheck && npm test`.

**Contracts**
- **`runVendorVerifier`:** `vendorId` and `matchingInvoiceId` must be real Convex `_id`s (the pipeline loads the
  invoice by id). Match an invoice by number, or when no number is given, the single open invoice for that vendor
  with the same amount. `bankMatches`: `null` when the request has no bank details. See `scenarios/world.ts` for a
  reference implementation. If a verifier throws, the case HOLDs (R14).
- **`callbackVerifier.start`:** may be called twice for one case (one retry after `no_answer`, 20 s later); insert a
  new `callbacks` row each time with `attempt = existing + 1`. The pipeline writes the "I'm calling them now on the
  number on file" reply itself (shown on /try; read out by the voice agent via `get_case_status`).
- **`ownerConcierge`:** on OTP success set `approvedAt` and, when `policyResult.needs.coolingOffSeconds > 0`,
  `coolingOffUntil = approvedAt + seconds*1000`; on decline/cancel set `cancelledAt`. Then schedule
  `internal.pipeline.advance`. The pipeline schedules its own wake-up at `coolingOffUntil`.
- **`runPayer`:** runs only after `cases.claimPayment` took the lock. For an approved bank change the vendor record
  has already been updated when the Payer is called; read destination details from the vendor record.
</details>

## What's real, what's simulated

| Real | Simulated |
| --- | --- |
| Phone calls: the Countersign line and the vendor callback are real Cartesia calls | The company (Lumen Labs), its owner and its vendors are fictional |
| Claude parses every request and writes every reply | Teammates play the owner and the vendor on their own phones |
| The Policy Engine, rules R1-R18 and the 39-scenario answer key | Money: Lumen Bank, the mock ledger, or the Increase **sandbox** (no real funds) |
| Owner step-up: real TOTP codes from an authenticator app, checked server-side | Vendor bank accounts store only routing + last 4; the sandbox uses a stand-in account number ending in those 4 digits |
| Hash-chained audit log, recomputed live in the War Room | No KYB or OFAC screening: the team's CRS account has neither product, so R8 never fires live |
| CRS sandbox: AtData Fraud Finder scores the email of any sender not in the vendor book; a high score escalates (R14) | Seed and scenario addresses use reserved `*.example` domains, which AtData always scores 100, so senders on file are not screened |
| Email: real mail to the Postmark inbound address, its real SPF/DKIM/DMARC results, attached PDFs read by Claude | The five email attacks on /try are crafted webhook payloads (forged headers can't be sent from a judge's inbox); they run through the same parser and pipeline and are labelled "Simulated" |
| Lumen Bank's countersignature: real ECDSA P-256 signatures, single-use nonces, checked against the public key | Lumen Bank itself is a sandbox inside the same Convex deployment as the signer; in production the bank holds only the public key and the signer runs in its own isolated service |
| | Replies to email are drafts shown in the War Room; nothing is ever sent |

Every lane in the War Room is a real database row written by the agent that did the work. The rail used for each
payment (Lumen Bank, mock ledger or Increase sandbox) is shown on the payment.

## Known limitations

- **A compromised vendor phone can fool the callback.** That's why a bank change still needs the owner's code (R2),
  unusual amounts escalate (R4) and large payments get a cooling-off window the owner can cancel in (R7). We reduce
  the risk; we don't claim zero.
- **OFAC (R8) is implemented and tested but never fires live:** the team's CRS account has no OFAC product.
- **Claude's wording varies run to run.** The decision never does: it's deterministic.
- **Email from a domain with no SPF/DKIM/DMARC** can't be authenticated at all, so it's treated as "not on file" and
  gets a callback rather than a block.
- **The bank and the signer share one deployment** in this demo; the signer belongs in its own isolated service.
- **US numbers only** for the vendor callback, and no SMS.
- **No sign-in:** the War Room and `/owner` are public views of fictional data; approvals still need the code.

## Future work

The same pipeline (parse, verify out of band, decide in code, require a second signer) can guard any action you
can't undo: bank and payroll changes, password and MFA resets, sharing sensitive documents, granting account access,
and the actions AI agents take on someone's behalf. Each action type adds its own schema, rules and verification
step; the channels, sender checks, callback, owner approval and audit chain stay the same.

- Bank feeds and accounting sync.
- A production payment rail, with the signer in its own isolated service.
- SOC 2-style access controls.
- A vendor-side Countersign, so two companies' agents can verify each other.

---

<sub>Built at Cal Hacks 13.0 by Aaryan (<a href="https://github.com/aaryanved">@aaryanved</a>), Shaurya
(<a href="https://github.com/shaurmittal">@shaurmittal</a>), Michael (<a href="https://github.com/Michaelwei08">@Michaelwei08</a>)
and Heechan (<a href="https://github.com/heechan02">@heechan02</a>). Full spec in <a href="docs/spec.md">docs/spec.md</a>;
the demo video is built from the real app in <a href="video/README.md">video/</a>.</sub>
