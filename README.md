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
npm test                # Policy Engine + scenario tests
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
  policy/engine.test.ts     P1  one test per rule R1-R12
convex/
  schema.ts                 P1  tables (spec §4)
  pipeline.ts               P1  leader: `advance(caseId)` step function
  cases.ts                  P1  `open` (entry point for every channel), update, UI queries
  audit.ts                  P1  hash-chained audit log + verifyChain
  agentRuns.ts                  start/finish rows that drive the War Room lanes
  lib/withAgentRun.ts           wrap any agent step so it shows up in the War Room
  agents/intake.ts          P1  Claude → PaymentRequest
  agents/vendorVerifier.ts  P3  vendor book (Moss), CRS KYB + OFAC
  agents/riskAnalyst.ts     P3  red flags + Claude explanation
  agents/callbackVerifier.ts P2 Cartesia outbound call to phoneOnFile; outcome, retry, timeout
  agents/ownerConcierge.ts  P4  OTP / ASI:One approval, cooling-off, owner alerts
  agents/payer.ts           P4  Increase sandbox / mock ledger
  channels/voice.ts         P2  Cartesia webhook tools (submit request, case status, callback outcome)
  channels/web.ts           P2  web chat channel (replaces SMS), used by app/try
  channels/reply.ts         P2/P4 send replyText back on the original channel
  lib/cartesia.ts           P2  Cartesia API client + tool secret check
  channels/agentBridge.ts   P4  Fetch.ai → Convex bridge
  http.ts                       HTTP routes (https://<deployment>.convex.site/...)
  seed.ts                   P3  fictional world (spec §7.1)
  scoreboard.ts             P4  top-bar numbers
app/                        P4  War Room (Next.js + Convex React hooks)
app/try/                    P2  judge chat page (QR code on the judge card)
scenarios/scenarios.json    P1  30-scenario answer key (spec §9)
fetch-agents/               P4  uAgents (Python): Countersign + fake vendor billing agent
```

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

## Team rules

- **Only `decide()` can say PAY.** No model output, tool or webhook moves money directly.
- **The callback number comes from `vendors.phoneOnFile`, read inside the tool.** Never from the request or model output.
- **Every agent step goes through `withAgentRun`.** The War Room shows only real runs.
- **Every state change writes an audit event** (`appendAudit` in mutations, `internal.audit.append` from actions).
- **Stubs default to HOLD.** If something is missing or fails, the case holds; it never pays.
- **Changes to `shared/types.ts` or `convex/schema.ts`** go in a small PR of their own; tell the team.
- Work on branches (`p1/...`, `p2/...`, ...) and merge to `main` often. Keep `main` passing `npm run typecheck && npm test`.

## What's real, what's simulated

_To fill in before submission (Hyphenate asks for this)._
