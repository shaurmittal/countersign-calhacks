# Countersign

**The second signer a one-person company never had.** You can talk it into anything except moving money.

Full spec: [docs/spec.md](docs/spec.md).

**Telephony is Cartesia only (no Twilio, no SMS).** Judges call the Countersign line or type at
`/try`. Agent prompts, tool configs and numbers: [docs/cartesia-setup.md](docs/cartesia-setup.md).

## Setup (everyone)

```bash
npm install
npx convex dev          # first run: log in, then ONE person creates the "countersign" project,
                        # everyone else picks the same project. Writes .env.local.
npm run seed            # loads the fictional Lumen Labs world
npm run dev             # War Room at http://localhost:3000 (second terminal)
npm test                # Policy Engine, intake, audit chain + 30-scenario answer key
npm run scenarios       # prints the answer-key table and the pitch line (no API calls)
npm run eval:intake     # same 30 scenarios through real Claude intake (needs ANTHROPIC_API_KEY locally)
npm run typecheck
```

Each person can use their own Convex dev deployment (default with `npx convex dev`), so you
don't overwrite each other's data. Use one shared **prod** deployment for the demo.

Secrets go in Convex env vars (`npx convex env set NAME value`), never in the repo. See [.env.example](.env.example).

**Push a fake message through the pipeline** (or open http://localhost:3000/try):

```bash
npx convex run cases:open '{"channel":"web","fromAddress":"+15555550199","rawContent":"Pay Northwind #NW-889"}'
```

## Layout and owners

```
shared/                     pure TS, no Convex imports, runs in tests/Convex/browser
  types.ts                  ★ the contract: PaymentRequest, findings, PolicyInput/Result
  config.ts                 demo policy values and limits
  policy/engine.ts          P1  Policy Engine: the ONLY code that can return PAY
  policy/engine.test.ts     P1  one test per rule R1-R15
  intake/                   P1  prescan (regex signals), Claude output schema, prompts
  reply.ts                  P1  reply templates + guard that rejects over-promising replies
  audit.ts                  P1  hash-chain helpers (sorted-key canonical JSON)
  totp.ts                   P4  owner step-up code check (RFC 6238, replay guard)
  ledger.ts                 P4  double-entry journal lines per payment
  scoreboard.ts             P4  scoreboard definitions (scam attempt, dollars lost, decision time)
convex/
  schema.ts                 P1  tables (spec §4)
  pipeline.ts               P1  leader: `advance(caseId)` step function
  cases.ts                  P1  `open` (entry point for every channel), update, UI queries
  audit.ts                  P1  hash-chained audit log + verifyChain
  agentRuns.ts                  start/finish rows that drive the War Room lanes
  lib/withAgentRun.ts           wrap any agent step so it shows up in the War Room
  agents/intake.ts          P1  Claude → PaymentRequest
  lib/claude.ts             P1  Claude calls (intake + reply); no Convex imports, shared with scripts/
  agents/vendorVerifier.ts  P3  vendor book (Moss), CRS KYB + OFAC
  agents/riskAnalyst.ts     P3  red flags + Claude explanation
  agents/callbackVerifier.ts P2 Cartesia outbound call to phoneOnFile; outcome, retry, timeout
  agents/ownerConcierge.ts  P4  authenticator-code approval (owner page / ASI:One), cooling-off, owner alerts
  agents/payer.ts           P4  mock ledger always; Increase sandbox ACH when INCREASE_API_KEY is set
  payments.ts               P4  payment rows, idempotency, `provisionIncrease` sandbox setup
  owner.ts                  P4  owner page queries (pending approvals, alert feed)
  warRoom.ts                P4  War Room case detail (lanes, callbacks, approvals, payments)
  lib/caseView.ts           P4  masked read helpers shared by the UI queries and the agent bridge
  lib/increase.ts           P4  Increase REST client (fetch, idempotency keys, one retry)
  channels/voice.ts         P2  Cartesia webhook tools (submit request, case status, callback outcome)
  channels/web.ts           P2  web chat channel (replaces SMS), used by app/try
  channels/reply.ts         P2/P4 send replyText back on the original channel
  lib/cartesia.ts           P2  Cartesia API client + tool secret check
  channels/agentBridge.ts   P4  Fetch.ai → Convex bridge (/agent/message, /agent/case, /agent/pending, /agent/approval)
  http.ts                       HTTP routes (https://<deployment>.convex.site/...)
  seed.ts                   P3  fictional world (spec §7.1)
  scoreboard.ts             P4  top-bar numbers
app/                        P4  War Room (Next.js + Convex React hooks)
app/owner/                  P4  owner approvals, opened on the owner's phone
app/try/                    P2  judge chat page (QR code on the judge card)
scenarios/scenarios.json    P1  30-scenario answer key (spec §9)
scenarios/world.ts          P1  seed world as data + reference verifier (what VendorFindings must contain)
scripts/eval-intake.ts      P1  live intake eval
scripts/enroll-owner-totp.ts P4 one-time authenticator enrollment for the owner
fetch-agents/               P4  uAgents (Python): Countersign + fake vendor billing agent
```

Owner approvals, payments and the Fetch.ai agents: setup and demo runbook in
[docs/p4-experience.md](docs/p4-experience.md).

## How a case flows

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

`advance` is idempotent. It skips steps whose output is already on the case, so any external
event can simply re-run it.

## Policy rules (shared/policy/engine.ts)

Strongest effect wins: **BLOCK > HOLD > ESCALATE > PAY**. An owner OTP/ASI:One approval satisfies
ESCALATE only; it never lifts a BLOCK or HOLD. PAY requires R12's positive checks, not just "no rule fired".

| Rule | Fires when | Effect |
| --- | --- | --- |
| R1 | No vendor-book match | BLOCK |
| R2 | New bank details (or change_bank / update_payroll) | HOLD + callback → confirmed: ESCALATE → OTP: PAY (vendor record updated, audited). no_answer: HOLD |
| R3 | Sender claims to be the payee (vendor or employee) but isn't on file | HOLD + callback → confirmed: OK, no_answer: ESCALATE |
| R4 | Amount >25% outside typical range | ESCALATE |
| R5 | No open invoice matching number/amount | HOLD |
| R6 | Over auto-pay limit, or vendor `alwaysEscalate` | ESCALATE |
| R7 | Over cooling-off threshold | ESCALATE, then HOLD until `coolingOffUntil` |
| R8 | OFAC hit | BLOCK, not overridable |
| R9 | Gift cards / crypto | BLOCK, not overridable |
| R10 | Callback denied | BLOCK; sender marked known-bad |
| R11 | Sender claims to be the owner | ESCALATE (the claim is worth nothing; real owner approves via OTP) |
| R12 | Known vendor, open invoice, amount matches, nothing else blocking | PAY |
| R13 | Invoice already paid | BLOCK, not overridable |
| R14 | Parse failure, several payments in one message, verifier/risk didn't run, non-USD (HOLD); CRS unavailable/unverified (ESCALATE) | HOLD / ESCALATE |
| R15 | Injection attempt (model OR regex prescan) | ESCALATE: never auto-paid |

### Contract notes for P2-P4

- **P3 `runVendorVerifier`:** `vendorId` and `matchingInvoiceId` must be real Convex `_id`s (the pipeline loads the invoice by id). Match an invoice by number, or when no number is given, the single open invoice for that vendor with the same amount. `bankMatches`: `null` when the request has no bank details. See `scenarios/world.ts` for a reference implementation. If a verifier throws, the case HOLDs (R14).
- **P2 `callbackVerifier.start`:** may be called twice for one case (one retry after `no_answer`, 20 s later); insert a new `callbacks` row each time with `attempt = existing + 1`. The pipeline writes the "I'm calling them now on the number on file" reply itself (shown on /try; read out by the voice agent via `get_case_status`).
- **P4 `ownerConcierge`:** on OTP success set `approvedAt` and, when `policyResult.needs.coolingOffSeconds > 0`, `coolingOffUntil = approvedAt + seconds*1000`; on decline/cancel set `cancelledAt`. Then schedule `internal.pipeline.advance`. The pipeline schedules its own wake-up at `coolingOffUntil`.
- **P4 `runPayer`:** runs only after `cases.claimPayment` took the lock. For an approved bank change the vendor record has already been updated when the Payer is called; read destination details from the vendor record.

## Voice: how we use Cartesia

Voice is the verification itself, not a front end. Setup details (prompts, tool configs, numbers)
are in [docs/cartesia-setup.md](docs/cartesia-setup.md).

**Features used**
- **Managed Agents** (Claude Haiku 5.5, Sonic voice): two production agents. *Countersign Inbound*
  answers the line and holds it during verification. *Countersign Callback* phones the vendor.
  A third test agent plays the vendor, so the whole loop runs agent-to-agent in development.
- **Cartesia phone numbers:** the inbound line, an outbound-only callback number and the test vendor.
  No other telephony provider.
- **Outbound calls API** (`POST /agents/calls`), with per-call `dynamic_variables`. The callback agent
  learns the amount, the vendor and the new account's last 4 at dial time, but deliberately not the
  invoice number: the vendor has to say it.
- **Webhook tools with secret headers**, all served by Convex HTTP actions:
  - `submit_payment_request` and `get_case_status` on the inbound agent. `get_case_status` long-polls,
    so the agent announces the callback once and then waits quietly.
  - `record_callback_outcome` on the callback agent.
- **System dynamic variables** `system__caller_id` and `system__conversation_id` (tool parameters the
  model can't change), plus an **assignment** that saves `case_id` from a tool response.
- **System tools:** End call on both agents; Voicemail detection on the callback agent, with no
  message, so payment details are never left on voicemail.
- **Get Call API:** after every callback we store the transcript and Cartesia's summary on the case
  for the War Room and the audit trail.

**Known limits**
- Cartesia numbers call **US numbers only**, so the vendor's number on file must be a US number.
  Inbound calls from anywhere work.
- **No SMS:** text requests come in through the web chat (`/try`).
- **The model classifies the vendor's answer.** Code then checks it: "confirmed" only counts if the
  vendor states the matching invoice number. Anything else counts as not verified.
- **Caller ID is never trusted.** Verification is always an outbound call to the number already on
  file; we never call back a number the caller gives.
- **No voice tool can move money.** The worst a jailbroken agent can do is say the wrong thing.
- **Waits:** a callback takes about 30–60 s end to end. Tools time out after 25 s, so long waits
  arrive as several 20 s checks.

## Team rules

- **Only `decide()` can say PAY.** No model output, tool or webhook moves money directly.
- **The callback number comes from `vendors.phoneOnFile`, read inside the tool.** Never from the request or model output.
- **Every agent step goes through `withAgentRun`.** The War Room shows only real runs.
- **Every state change writes an audit event** (`appendAudit` in mutations, `internal.audit.append` from actions).
- **Stubs default to HOLD.** If something is missing or fails, the case holds; it never pays.
- **Changes to `shared/types.ts` or `convex/schema.ts`** go in a small PR of their own; tell the team.
- Work on branches (`p1/...`, `p2/...`, ...) and merge to `main` often. Keep `main` passing `npm run typecheck && npm test`.

## What's real, what's simulated

| Real | Simulated |
| --- | --- |
| Phone calls: the Countersign line and the vendor callback are real Cartesia calls | The company (Lumen Labs), its owner and its vendors are fictional |
| Claude parses every request and writes every reply | Teammates play the owner and the vendor on their own phones |
| The Policy Engine, rules R1-R15 and the 30-scenario answer key | Money: the mock ledger, or the Increase **sandbox** (no real funds) |
| Owner step-up: real TOTP codes from an authenticator app, checked server-side | Vendor bank accounts store only routing + last 4; the sandbox uses a stand-in account number ending in those 4 digits |
| Hash-chained audit log, recomputed live in the War Room | CRS identity checks run against the CRS sandbox with test identities only |
| Fetch.ai agents on Agentverse speaking the Chat Protocol; the owner flow in ASI:One | The vendor billing agent is ours, playing a compromised vendor |

Every lane in the War Room is a real database row written by the agent that did the work.
The rail used for each payment (mock ledger or Increase sandbox) is shown on the payment.
