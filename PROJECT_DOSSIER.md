# Countersign: project dossier

Compiled on 2026-10-25 from the repository at `main` = `504467f` (shaurmittal/countersign-calhacks).
Every claim cites a file, a commit or a command I ran. Anything I could not confirm is marked
**UNVERIFIED**.

---

## 1. One-line pitch

**One sentence:** Countersign is a payments gatekeeper for one-person companies. AI agents take every
request to pay someone (by phone, chat, email or agent message), verify anything new by calling the
vendor back on the number already on file, and only a deterministic rules engine can release the money.

**Expanded:** In a company with staff, one person requests a payment and another approves it. A
solo founder has no second person, which makes them an easy target for "our bank changed" invoice
fraud and voice-cloned "wire it now" calls. Countersign plays the second signer. Claude reads each
request into a strict schema. Verifier and risk agents gather evidence, and a voice agent phones the
vendor on the number already on file. A plain-TypeScript Policy Engine with 18 rules decides PAY,
HOLD, ESCALATE or BLOCK. The sandbox bank moves money only for a transfer carrying that engine's
ECDSA countersignature. Built in about 35 hours at Cal Hacks 13.0 (first commit 2026-10-23 21:20
PDT, latest 2026-10-25 07:52 PDT).

**Existing taglines, verbatim:**
- "The second signer a one-person company never had." from `package.json` (`description`) and
  `PRODUCT.md` line 39.
- "You can talk it into anything except moving money." from `PRODUCT.md` line 21 and the
  `/demo` landing hero (`app/demo/sections/Sections.tsx`).
- "The models talk; only code can pay." from `README.md`, section "How a request is decided".

---

## 2. Status & stage

**Stage:** a hackathon project, about 35 hours old, with a fictional company ("Lumen Labs",
owner "Priya Raman") and sandbox money. Not a product with users.

### Built and working end to end (with evidence)

- **Web-chat → pipeline → decision → reply.**
  - Used live on the dev deployment while I was gathering data: a /try message produced a HOLD with
    a callback on the War Room; see `brand/gallery/02-war-room-calling-the-vendor.png`, captured
    2026-10-25 07:39.
  - Integration-tested in `convex/pipeline.test.ts` (27 tests).
- **Phone line plus vendor callback through Cartesia.** Evidence: commit `57ed00a` (2026-10-25)
  rebuilds the demo film from "the 7:16 call". A teammate made the scam call from their own phone,
  and another answered Countersign's callback on the vendor's number on file. Call audio is in
  `video/assets/`.
- **The Policy Engine and the 39-scenario answer key.** I ran it: section 6.
- **Live run of 28 scenarios through a deployed dev pipeline, before email support existed.**
  - Recorded as "28/28 live scenarios match the answer key, 0 false PAY" in commit `fe00547`
    (2026-10-24) and in `docs/judge-qa.md` line 11.
  - The run itself was not reproduced by me (UNVERIFIED today, see section 6).
- **Lumen Bank countersignature.** Commit `780cad0` reports a dev-deployment run: "Pay Northwind
  #NW-889" paid as a countersigned transfer, and the bank endpoint rejected a missing signature,
  another key, a tampered amount and an exact replay. Tests: `convex/bank.test.ts`,
  `shared/bank/verify.test.ts`.
- **Owner approvals with a TOTP code, cooling-off, and block/trust lists.** Files:
  `convex/agents/ownerConcierge.ts`, `shared/totp.ts`, `convex/senderLists.ts`, and their tests.
- **Email intake via Postmark, with SPF/DKIM/DMARC checks and Claude reading PDF invoices.**
  - Commit `c4bdb84`; tests in `shared/email/*.test.ts` and `convex/channels/email.test.ts`.
  - Live inbound email on a deployment: UNVERIFIED. No commit message reports a real email
    received.

### Partially built

- **WhatsApp channel.** `docs/whatsapp-setup.md` says: "tested in memory only … Nothing has talked
  to a real Meta app yet."
- **Agent channel (Fetch.ai uAgents).**
  - `fetch-agents/` (Python) and `convex/channels/agentBridge.ts` exist, with 2 bridge tests.
  - The team removed Fetch.ai from the README and Devpost write-up (commit `bb37d43`).
  - Whether the agents were ever registered or run on Agentverse: UNVERIFIED.
- **Increase sandbox ACH rail.**
  - Code is in `convex/lib/increase.ts`, enabled when `INCREASE_API_KEY` is set (commit
    `256b218`).
  - The default rail is Lumen Bank. No commit reports a real Increase sandbox transfer:
    UNVERIFIED.
- **OFAC screening (rule R8).** Implemented and tested, but "never fires live: the team's CRS
  account has no OFAC product" (`README.md`, Known limitations).

### Only planned (from `docs/devpost.md` "What's next")

- Bank feeds and accounting sync.
- A production payment rail with the signer in its own isolated service.
- SOC 2-style access controls.
- A vendor-side Countersign.

No code for any of these was found.

### Deployment (checked with curl on 2026-10-25)

- **Frontend: Vercel**, `https://countersign-calhacks.vercel.app`.
  - This is the GitHub repo's `homepageUrl`.
  - `/`, `/try`, `/demo`, `/bank` and `/owner` all returned HTTP 200.
  - The production JS bundle references Convex deployment `insightful-otter-553`.
- **Backend: Convex Cloud.**
  - Demo deployment: `insightful-otter-553` (`docs/cartesia-setup.md` line 16).
  - Dev deployment: `moonlit-buzzard-801` (this machine's `.env.local`).
- **Repository:** public (`gh repo view` → `"visibility":"PUBLIC"`), created 2026-10-24 04:02 UTC.
- **Phone line:** +1 (256) 215-6932 (shown in the app's top bar, `app/demo/sections/Sections.tsx`).
  Whether it is still answering today: UNVERIFIED (not called).
- The judge card's comment mentions `https://countersign.vercel.app/try` as an example; that URL
  returns 404. It is only an example in a comment. The real link comes from `NEXT_PUBLIC_TRY_URL`
  (`app/judge-card/page.tsx` line 3).

### Users, revenue, feedback

**No evidence in repo.** There are no analytics, signups, pilots, revenue or user feedback.
`PRODUCT.md` line 48 says it directly: "No customers, testimonials or production usage exist;
never invent them." The War Room's live counters show test traffic from the team (section 6).

---

## 3. Scale

How I measured this: `git ls-files`, counting **non-blank lines**, using a script at
`scratchpad/loc.py` (not in the repo). cloc, tokei and scc were not installed.

**Excluded:**
- `package-lock.json` and `video/package-lock.json`.
- `convex/_generated/*` (5 generated files).
- Binary and media files: 15 PNG, 7 SVG, 1 ICO, 11 MP3, 9 WAV, 7 MP4, 2 PDF.
- `.env.example` and the files with no extension.

### Lines by language (non-blank lines)

| Language | Lines | Files |
|---|---:|---:|
| TypeScript (`.ts`) | 15,948 | 135 |
| TypeScript (`.tsx`) | 5,217 | 31 |
| Markdown | 2,099 | 17 |
| JSON (configs, scenarios, design tokens) | 945 | 10 |
| CSS | 612 | 3 |
| Python | 200 | 2 |
| Shell | 47 | 2 |
| YAML | 20 | 1 |
| JavaScript | 5 | 1 |

- Code without Markdown and JSON: **22,049 lines**.
- Of that, test code is **6,287 lines in 38 `*.test.ts` files**.

### Repository stats

| Metric | Value | Source |
|---|---|---|
| Tracked files | 267 | `git ls-files \| wc -l` |
| Commits on `main` | 150 (90 non-merge, 60 merge) | `git rev-list --count [--no-merges] HEAD` |
| Merged PRs | 53 | `gh pr list --state merged` |
| First commit | 2026-10-23 21:20:53 −0700, `6d72f52` "Scaffold Countersign architecture" (shaurmittal) | `git log --reverse` |
| Latest commit | 2026-10-25 07:52:52 −0700, `504467f` (merge) | `git log -1` |
| Active days | 3 calendar days (10-23, 10-24, 10-25); commits in 31 distinct clock-hours | `git log --date=short` |
| GitHub issues | 0 | `gh issue list --state all` |

### Contributors (non-merge commits)

`git shortlog -sne --no-merges`:

| Person (role from README) | Non-merge commits | Lines added* |
|---|---:|---:|
| Shaurya Mittal (P2: voice, channels, landing, /try, film) | 30 | 11,252 |
| Aaryan Ved Bhalla (P1: schema, pipeline, Policy Engine, bank) | 26 | 10,352 |
| Michael Wei (P3: verification) | 20 | 8,814 |
| Heechan Yang (P4: War Room, owner, payer) | 14 | 3,457 |

\* From `git log --no-merges --numstat`, excluding lockfiles and `_generated`.

Including merges, Shaurya also has 47 commits as "Shaurya Mittal": GitHub web merges of PRs.

**AI assistance:** all 90 non-merge commits from all four authors carry a
`Co-Authored-By: Claude` trailer (`git log --format=%B | grep -c`). The code was written with
Claude Code. Say so if asked in an interview.

### Code lines by area (excluding Markdown and JSON)

| Area | Lines | Files |
|---|---:|---:|
| `shared/verification` | 4,482 | 28 |
| `convex` (top level: pipeline, bank, cases, schema, tests) | 3,071 | 21 |
| `app/demo` (landing page and film) | 2,265 | 12 |
| `convex/agents` | 1,467 | 9 |
| `convex/channels` | 1,346 | 11 |
| `video` (Remotion demo video) | 1,268 | 13 |
| `app/components` | 1,099 | 8 |
| `shared` (top level) | 1,095 | 14 |
| `convex/lib` | 794 | 12 |
| `shared/email` | 703 | 6 |
| `shared/policy` | 670 | 3 |
| `app/owner` | 634 | 4 |
| `app/ui` | 504 | 7 |
| `app/try` | 499 | 1 |
| `shared/intake` | 400 | 4 |
| `app/bank` | 350 | 1 |
| `scripts` | 304 | 4 |
| `shared/bank` | 293 | 3 |
| `scenarios` | 245 | 3 |
| `fetch-agents` (Python) | 200 | 2 |

### Largest files (non-blank lines)

| Lines | File |
|---:|---|
| 549 | `video/src/Demo.tsx` |
| 538 | `convex/pipeline.test.ts` |
| 531 | `shared/verification/riskFlags.test.ts` |
| 499 | `app/try/page.tsx` |
| 455 | `convex/bank.ts` |
| 447 | `app/demo/landing.css` |
| 435 | `shared/verification/vendorMatch.test.ts` |
| 393 | `shared/policy/engine.test.ts` |
| 357 | `convex/pipeline.ts` |
| 350 | `app/bank/page.tsx` |

---

## 4. Architecture

### Data flow

```
 Phone (Cartesia agent) ─┐
 Web chat (/try) ────────┤
 Email (Postmark inbound)┼─► Convex HTTP action / mutation ─► cases.open  (dedupe on externalId)
 WhatsApp (in-memory only)┤                                       │
 Agent bridge (uAgents) ──┘                                       ▼
                                                   pipeline.advance(caseId)   [idempotent step function]
                                                     1. Intake: regex prescan + Claude → PaymentRequest (zod)
                                                     2. Vendor Verifier ∥ Risk Analyst
                                                          (vendor book, Moss, CRS/AtData, email auth, lists)
                                                     3. decide()  ← plain TypeScript, 18 rules, no LLM
                                                     4. by result:
                                                          HOLD+callback → Callback Verifier (Cartesia outbound
                                                                           to vendors.phoneOnFile) → advance again
                                                          ESCALATE      → Owner Concierge (TOTP on /owner,
                                                                           cooling-off timer) → advance again
                                                          PAY           → cases.claimPayment (lock) → Payer
                                                                           → signRelease (ECDSA P-256)
                                                                           → Lumen Bank transfer: verify sig,
                                                                             consume nonce, debit, record
                                                          BLOCK/HOLD/NO_ACTION → close
                                                     reply → channels/reply.dispatch (same channel)
                                                   every step → appendAudit (hash chain) + agentRuns row
                                                   watchdog: restart a stalled run ≤2×, then HOLD (R14)
 Browser (Next.js on Vercel): War Room /, /owner, /bank, /try, /demo  ← Convex reactive queries
```

Sources: `convex/pipeline.ts`; `README.md` "The pipeline step by step"; `shared/policy/engine.ts`.

### Components

| Component | What it does | Runs on | File(s) |
|---|---|---|---|
| Channels | Turn a call, chat, email, WhatsApp or agent message into a case | Convex HTTP actions | `convex/channels/*.ts`, `convex/http.ts` |
| Intake Parser | Regex prescan, then Claude produces a structured `PaymentRequest` | Convex action | `convex/agents/intake.ts`, `convex/lib/claude.ts`, `shared/intake/` |
| Vendor Verifier | Vendor-book match, lookalike detection, invoice match, bank match, CRS email screen, email auth, lists | Convex action (Node for Moss) | `convex/agents/vendorVerifier.ts`, `shared/verification/` |
| Risk Analyst | Red flags plus a Claude-written explanation, with a 4 s budget | Convex action | `convex/agents/riskAnalyst.ts`, `shared/verification/riskFlags.ts` |
| Policy Engine | `decide()`: 18 rules, strongest effect wins (BLOCK > HOLD > ESCALATE > PAY) | Pure TS (also runs in the browser on /demo) | `shared/policy/engine.ts` |
| Callback Verifier | Outbound Cartesia call to the number on file; one retry; timeout | Convex action and scheduler | `convex/agents/callbackVerifier.ts` |
| Owner Concierge | TOTP approval, cooling-off, cancel, alerts | Convex | `convex/agents/ownerConcierge.ts`, `shared/totp.ts` |
| Payer | Takes the payment lock and pays via Lumen Bank (default), the mock ledger or Increase sandbox | Convex action | `convex/agents/payer.ts`, `convex/lib/increase.ts` |
| Countersign signer | `signRelease`: the only reader of `COUNTERSIGN_SIGNING_KEY` | Convex | `convex/lib/countersign.ts` |
| Lumen Bank | Sandbox bank: verifies countersignatures, single-use nonces, balances, payees; public `POST /bank/transfers` limited to 30 attempts/minute | Same Convex deployment | `convex/bank.ts`, `shared/bank/` |
| Audit log | Hash-chained events (sorted-key canonical JSON); `verifyChain` | Convex | `convex/audit.ts`, `shared/audit.ts` |
| Watchdog | Restarts a stalled run after 90 s, at most twice, then HOLD | Convex scheduler | `convex/pipeline.ts` line 343 (`MAX_RESTARTS = 2`) |
| Crons | Keeps the Moss worker warm | Convex cron | `convex/crons.ts` |
| Web UI | War Room, /owner, /bank, /try, /demo, /judge-card | Next.js on Vercel | `app/` |
| Demo video | Playwright captures, Cartesia voiceover, Remotion edit | Local | `video/` |
| uAgents | Countersign agent and demo vendor billing agent (Python) | UNVERIFIED where they run | `fetch-agents/` |

### Data model

The schema has 16 tables and 21 indexes (`convex/schema.ts`):

| Table | Holds | Indexes |
|---|---|---|
| `owner` | Owner row, including the TOTP replay counter | — |
| `vendors` | Vendor book: name, phone and bank on file (routing + last 4), limits, known-bad senders | `by_name` |
| `senderLists` | The owner's deny and trust entries | `by_kind` |
| `invoices` | Open and paid invoices | `by_vendor`, `by_number` |
| `cases` | One payment request: request, findings, policyResult, status, reply | `by_createdAt`, `by_externalId`, `by_from` |
| `agentRuns` | Start and finish rows that drive the War Room lanes | `by_case` |
| `callbacks` | Callback attempts and outcomes | `by_case`, `by_callSid` |
| `approvals` | Owner approvals and cooling-off | `by_case` |
| `payments` | Payment rows | `by_case`, `by_idempotencyKey` |
| `bankAccounts` | Lumen Bank accounts | — |
| `bankPayees` | Lumen Bank payees | `by_vendor` |
| `bankTransfers` | Lumen Bank transfers | `by_createdAt`, `by_status`, `by_source` |
| `bankNonces` | Single-use countersignature nonces | `by_nonce` |
| `emailSimulations` | The simulated email attacks on /try | `by_sender` |
| `auditEvents` | The hash-chained audit log | `by_seq`, `by_case` |

The shared contract types (`PaymentRequest`, findings, `PolicyInput`, `PolicyResult`) are in
`shared/types.ts`.

### External services

| Service | Used for | Where |
|---|---|---|
| Anthropic API, `claude-opus-5-5` | Intake parsing (text and PDF), reply writing, risk explanations | `convex/lib/claude.ts` line 18 |
| Cartesia Managed Agents (Claude Haiku 5.5, Sonic voice) | Inbound phone agent and outbound vendor callback; phone numbers; webhook tools; Get Call API for transcripts | `convex/lib/cartesia.ts`, `convex/channels/voice.ts`, `docs/cartesia-setup.md` |
| Moss (`@moss-js/moss`) | Vendor-book search, and mid-call policy lookup (`lookup_policy`, 2 s cap with a keyword fallback) | `shared/verification/moss.ts`, `convex/crons.ts` |
| CRS / AtData Fraud Finder | Email-risk score for senders not on file | `shared/verification/crs.ts` |
| Postmark Inbound | Email channel; the receiving server's SPF/DKIM/DMARC results | `convex/channels/email.ts`, `shared/email/` |
| Increase (sandbox) | Optional ACH rail | `convex/lib/increase.ts` |
| Meta WhatsApp Cloud API | WhatsApp channel (in-memory tests only) | `convex/channels/whatsapp.ts` |
| Fetch.ai uAgents | Agent channel (Python agents) | `fetch-agents/` |
| Vercel | Frontend hosting and PR preview deployments | `vercel.json`; PR checks |

---

## 5. Tech stack

### Root `package.json`

Installed versions were read from `node_modules/*/package.json`.

- **Runtime dependencies:**
  - `next` 16.4.3, `react` / `react-dom` 19.3.1.
  - `convex` 1.48.0.
  - `@anthropic-ai/sdk` 1.3.0.
  - `@moss-js/moss` 1.21.0.
  - `zod` 4.6.7.
  - `otpauth` 9.5.2.
  - `framer-motion` 14.6.0.
  - `tailwindcss` / `@tailwindcss/postcss` 4.3.3.
  - `lucide-react` ^1.61.0, `qrcode` ^1.5.4, `clsx` ^2.1.1, `tailwind-merge` ^3.7.0,
    `postcss` ^8.5.31.
- **Dev dependencies:**
  - `typescript` 7.0.2, `vitest` 5.0.5, `convex-test` 0.0.60.
  - `tsx` ^4.20.6, `@edge-runtime/vm` 5.0.0, `@types/*`.

### Other manifests

- **`video/package.json`:**
  - `remotion`, `@remotion/cli`, `@remotion/google-fonts` and `@remotion/media-utils`, all ^4.0.538.
  - `playwright-core` ^1.64.1, `react` ^19.3.1, `typescript` ^7.0.2.
- **`fetch-agents/requirements.txt`:**
  - `uagents==0.26.1`, `uagents-core==0.4.12`.
  - `requests==2.34.2`, `python-dotenv==1.2.4`.

### Infrastructure

- **Hosting:** Vercel for Next.js (`vercel.json`); Convex Cloud for the database, functions,
  scheduler and crons (`convex.json` sets the Node 22 runtime with `@moss-js/moss` as an external
  package).
- **Database, queue and scheduler:** Convex tables, `ctx.scheduler.runAfter` and `convex/crons.ts`.
  There is no separate queue service.
- **Auth:** none for viewers. The War Room and `/owner` are public views of fictional data.
  - Owner actions need a 6-digit TOTP code (RFC 6238, replay guard, lockout after 5 wrong codes):
    `shared/totp.ts`, `convex/senderLists.ts`.
  - Webhooks are authenticated by secret headers or Meta's signature.
- **CI/CD:** GitHub Actions `.github/workflows/ci.yml` runs on push to `main` and on every PR:
  `npm ci`, `npm run typecheck`, `npm test`, then `npm run scenarios` into the job summary (Node 24).
  Vercel builds a preview for every PR.
- **Containers:** none found.

### AI specifics

- **Models:** `claude-opus-5-5` through the Anthropic SDK; Claude Haiku 5.5 inside the Cartesia
  agents (`README.md`, Cartesia section).
- **Prompts:** `shared/intake/` holds the intake prompts and the zod output schema.
  `convex/lib/claude.ts` holds the reply and intake calls. Budgets use a race rather than an SDK
  abort (commit `fe00547`).
- **Guards:**
  - A regex prescan for injection (`shared/intake/prescan.ts`).
  - A reply guard that rejects replies promising more than the engine decided
    (`shared/reply.ts`).
  - Rule R15: an injection is never auto-paid.
- **Embeddings and retrieval:** Moss semantic search over the vendor book and policy text. No model
  training or fine-tuning was found.
- **Evaluation:**
  - `npm run scenarios`: offline, with the reference verifier and no API calls.
  - `npm run eval:intake`: the 39 scenarios through real Claude intake. No saved results found.
  - `npm run rehearse`: the scenarios through a deployed dev pipeline (`scripts/live-scenarios.ts`).

---

## 6. Measured numbers

| # | Value | What it measures | Conditions | Source |
|---|---|---|---|---|
| 1 | **39 scenarios: 26/26 scams blocked, 13/13 legitimate paid or correctly escalated, 0 false PAY** | Policy Engine plus reference verifier against the hand-labelled answer key | Offline, deterministic, no API calls; 39 cases in `scenarios/scenarios.json` | `npm run scenarios` (I ran it on 2026-10-25; output below). Also runs in CI. |
| 2 | **1,126 tests passed, 38 files, 0 failed** | Unit and integration tests | Local machine, `npx vitest run`, 1.27 s duration | Ran by me; per-file counts in section 7 |
| 3 | **28/28 live scenarios match the answer key, 0 false PAY** | The scenarios through a deployed dev pipeline with real Claude intake; the callback answer and owner code were simulated | Dev deployment, 2026-10-24, before the 9 email scenarios and the 2 offline-only ones (OFAC, CRS outage) | Commit `fe00547`; `docs/judge-qa.md` line 11. **Not re-run by me** (it wipes the target deployment). |
| 4 | **4/4 forged or replayed transfers refused** | Lumen Bank rejects no signature, a wrong key, a tampered amount and an exact replay | Unit/integration tests, plus one manual dev-deployment run | `convex/bank.test.ts:190`; commit `780cad0` |
| 5 | Countersignature lifetime **2 minutes**, single use | Design parameter, not a measurement | — | `shared/bank/payload.ts`; `README.md` |
| 6 | Moss policy lookup: **3,755 ms and 2,727 ms cold** (keyword fallback answered), **1,275 ms warm** (Moss answered) | Latency of the bare `lookup_policy` action | Dev deployment, n = 3 | Commit `3595da2` (Michael Wei) |
| 7 | CRS `screenEmail` returned in **378 ms** | One AtData Fraud Finder call | Dev deployment, n = 1 | Commit `4467769` (Michael Wei) |
| 8 | Risk Analyst Claude call crash: **seen twice, both exactly 4.0 s** into the call | The SDK abort bug (section 8) | PR #20 runs | Commit `3bd823e` |
| 9 | Dev War Room scoreboard: **16 requests, 5 scam attempts stopped, $0.00 lost, 1 bill paid ($1,200.00), 7.8 s median decision, 3,457 audit events, chain verified** | Live counters over all cases on the dev deployment; median decision excludes cases that waited for the owner (`shared/scoreboard.ts` line 35) | Team test traffic, not users. Observed in my screenshot at 07:39 on 2026-10-25. | `brand/gallery/02-war-room-calling-the-vendor.png` |
| 10 | Demo film: **105 s (was 125 s)**; demo video **1:21** | Media length | — | Commit `d0040e7`; `README.md` "Demo video" |
| 11 | Configured budgets (limits, not measurements): Risk Analyst Claude **4 s**; `lookup_policy` **2 s**; watchdog **90 s**, **2** restarts; Cartesia dial abort **20 s**; tool timeout **25 s**; Claude SDK backstop **120 s** | — | — | Commits `3bd823e`, `3595da2`, `fe00547`, `24afb59`; `convex/pipeline.ts` line 343 |

**Raw output of `npm run scenarios`** (2026-10-25), last line:

```
39 scenarios · 26/26 scams blocked · 13/13 legitimate paid or correctly escalated · 0 false PAY
```

Every row was `✓`. The decisions and rules for each scenario are in `README.md` → Results.

### Metrics not measured yet

- Live intake accuracy of `npm run eval:intake`: the script exists, but no saved results or commit
  report were found.
- End-to-end latency of a callback: the README says "about 30–60 s" but gives no measured
  distribution. Treat it as UNVERIFIED.
- p50/p95 decision latency under load, throughput and concurrency limits.
- Test coverage: no coverage tool is configured in `vitest.config.ts` or CI.
- Bundle size and page load times: no `next build` analysis was found, and I did not run a build.
- Claude cost per case: not tracked.
- False positives on real traffic, meaning legitimate bills held. Only the 13 synthetic
  legitimate scenarios exist.
- Any user, adoption or revenue metric (there are no users).

---

## 7. Testing & reliability

**Total:** 1,126 tests in 38 files, all passing (`npx vitest run`, 2026-10-25). Per file
(`--reporter=verbose`):

| Tests | File | Covers |
|---:|---|---|
| 212 | `shared/verification/riskFlags.test.ts` | Red-flag detection |
| 114 | `shared/verification/vendorMatch.test.ts` | Vendor-book matching |
| 75 | `shared/verification/lookalike.test.ts` | Lookalike vendor names and domains |
| 66 | `shared/verification/seedScenarios.test.ts` | Verifier against the seeded world |
| 53 | `shared/policy/engine.test.ts` | One or more tests per rule R1–R18, plus invariants |
| 51 | `shared/verification/crs.test.ts` | CRS client |
| 48 | `shared/verification/invoices.test.ts` | Invoice matching |
| 42 | `scenarios/scenarios.test.ts` | The answer key |
| 38 | `shared/verification/explainRewrite.test.ts` | Risk-explanation rewrite |
| 34 | `shared/verification/text.test.ts` | Text normalisation |
| 30 | `shared/verification/moss.test.ts` | Moss client |
| 30 | `shared/verification/bank.test.ts` | Bank-detail checks |
| 30 | `shared/intake/intake.test.ts` | Intake schema and prescan |
| 28 | `shared/verification/policyLookup.test.ts` | Mid-call policy lookup |
| 27 | `convex/pipeline.test.ts` | Pipeline integration (convex-test): PAY, BLOCK, HOLD, ESCALATE, races, watchdog |
| 27 | `convex/agents/riskAnalyst.test.ts` | Risk Analyst agent |
| 23 | `convex/lib/riskExplanation.test.ts` | Risk explanation |
| 19 | `shared/bank/verify.test.ts` | Lumen Bank checks, in order |
| 18 | `shared/verification/lists.test.ts` | Deny and trust lists |
| 16 | `shared/whatsapp.test.ts` | WhatsApp parsing |
| 16 | `shared/verification/explain.test.ts` | Explanations |
| 14 | `convex/bankChange.test.ts` | Owner-approved bank-detail change |
| 13 | `shared/email/auth.test.ts` | SPF/DKIM/DMARC evaluation |
| 11 | `shared/email/inbound.test.ts` | Postmark payload parsing |
| 11 | `convex/channels/email.test.ts` | Email channel |
| 10 | `shared/totp.test.ts` | TOTP and the replay guard |
| 10 | `convex/channels/whatsapp.test.ts` | WhatsApp channel |
| 10 | `convex/bank.test.ts` | Lumen Bank transfers and attacks |
| 9 | `convex/channels/voice.test.ts` | Cartesia webhook tools |
| 8 | `shared/scoreboard.test.ts` | Scoreboard definitions |
| 7 | `convex/senderLists.test.ts` | List edits behind a code |
| 6 | `convex/agents/ownerConcierge.test.ts` | Approvals and cancel |
| 5 | `shared/audit.test.ts` | Hash chain: detects edits and deletions |
| 4 | `shared/ledger.test.ts` | Double-entry ledger |
| 4 | `convex/channels/web.test.ts` | Web chat |
| 3 | `convex/lib/countersign.test.ts` | Import guards: only the Payer signs, only countersign.ts reads the key |
| 2 | `convex/lib/cartesia.test.ts` | Cartesia client |
| 2 | `convex/channels/agentBridge.test.ts` | Agent bridge |

There are no browser or end-to-end UI tests.

**CI:** `.github/workflows/ci.yml` runs on push to `main` and on PRs. **Currently green:** the
last 8 runs, through the `504467f` push on 2026-10-25 14:52 UTC, all show `success`
(`gh run list`).

### Implemented reliability, security and privacy measures (with sources)

- **Only `decide()` can return PAY,** and PAY requires rule R12's positive checks. Tests:
  `engine.test.ts:402` "only R12 ever produces PAY" and `:77` "never pays on missing data".
- **Fail closed:**
  - A missing or failing verifier means HOLD (R14).
  - A missing signing key means the case HOLDs (`bank.test.ts:137`).
  - A wrong verify key means the bank refuses (`:146`).
- **Exactly-once payment:** `cases.claimPayment` takes a transactional lock. Test:
  `pipeline.test.ts:377` "two pipeline runs racing on an approved case pay exactly once".
  Increase calls use idempotency keys.
- **Single-use countersignatures:** nonce table; a replay is rejected even after expiry
  (`shared/bank/verify.test.ts:117`).
- **Tamper-evident audit:** hash chain re-verified in the War Room (`shared/audit.test.ts:26`,
  `:32`).
- **Callbacks only to the number on file:** read inside the tool, never taken from the request
  (`README.md` Team rules). Test: `pipeline.test.ts:136`.
- **Owner codes:**
  - Replay guard (`totp.test.ts:47`).
  - Lockout after 5 wrong codes (`senderLists.test.ts:67`, `bankChange.test.ts:241`).
  - Cancel is exempt from the lockout so an attacker can't block it (`ownerConcierge.test.ts:78`,
    from commit `831c829`).
- **Email forgery:** DMARC, or aligned DKIM/SPF, from the topmost headers only
  (`shared/email/auth.test.ts:35`).
- **Prompt injection:** regex prescan plus a model flag lead to R15, never auto-paid
  (`engine.test.ts:354`). The reply guard is in `shared/reply.ts`.
- **Watchdog for runs that die:** `convex/pipeline.ts`, with tests at `pipeline.test.ts:513` and
  `:547`.
- **Rate limit:** the public bank endpoint allows 30 attempts per minute (commit `780cad0`).
- **Masking and privacy:**
  - Bank details are stored and shown only as routing plus last 4 (`README.md` What's real).
  - Values leave the backend masked (`convex/lib/caseView.ts`).
  - `privacy:purgeCallerNumbers` masks listed phone numbers.
- **Secrets:** only in Convex env vars. `.env.example` lists names only; nothing is committed.
  `scripts/countersign-keygen.ts` prints `read -s` commands.

---

## 8. Hardest problems & key decisions

1. **Keeping the LLM away from money.**
   - *Problem:* models can be talked into anything.
   - *Decision:* Claude only reads requests and writes replies. A pure function `decide()` with 18
     rules is the only path to PAY. Then a second, independent layer: the bank verifies an ECDSA
     P-256 signature from the Payer over that exact transfer before moving anything.
   - *Evidence:* `shared/policy/engine.ts`; commit `780cad0`; the import-guard tests in
     `convex/lib/countersign.test.ts` fail if any other module imports the signer or reads the key.

2. **Pipeline runs dying where no catch can reach them.**
   - *Problem:* the Anthropic SDK's abort-on-timeout threw "The stream is not in a state that
     permits close" from inside a timer in Convex's runtime. Cases were stuck in VERIFYING forever.
   - *Found by:* the live rehearsal script.
   - *Fix (commit `fe00547`):*
     - A watchdog restarts a stalled idempotent run, at most twice, then closes the case as HOLD.
     - Claude budgets became a promise race instead of an SDK abort.
     - Michael applied the same fix to the Risk Analyst in `3bd823e`, after seeing the crash twice
       at exactly 4.0 s.

3. **Model nondeterminism leaking into a rule.**
   - *Problem:* "Hey it's Sam, I switched banks…" was labelled vendor, employee or unknown from run
     to run, so R3 fired only sometimes.
   - *Fix:* R3 also keys on the action (`change_bank` / `update_payroll`) from a sender not on
     file, so it no longer depends on the label. Commit `f22ddc7`.

4. **A bank-detail change that could have paid an invoice.**
   - *Problem:* `matchInvoice` fell back to the vendor's only open invoice. A /bank change request
     for Pixel & Pine therefore carried its $4,800 invoice. After a confirmed callback, the owner's
     approval would have paid that invoice to the new account.
   - *Fix:* bank-channel cases drop the invoice match. The test mock was made to return the open
     invoice like the real verifier; without the fix, 6 tests fail. Commit `5cc7708`.

5. **Exactly-once payment under concurrent triggers.**
   - *Problem:* callbacks, owner approvals and cooling-off timers can all re-run `advance`.
   - *Decision:* idempotent steps, plus a transactional `claimPayment` lock that re-reads the
     approval inside the lock (commit `24afb59`).
   - *Tested by:* `pipeline.test.ts:377`.

6. **Email sender authentication.**
   - *Problem:* a From address is trivially forged.
   - *Decision:* trust only the receiving server's topmost Authentication-Results (DMARC pass, or
     aligned DKIM/SPF). Forged vendor or owner addresses are BLOCKed (R17).
   - *Evidence:* `shared/email/auth.ts` (Shaurya Mittal), commit `047b731`.

### Other notable bugs fixed

- `831c829` (Michael Wei):
  - Owner cancel no longer sits behind the wrong-code lockout (public case IDs made a
    denial-of-cancel possible).
  - A bank change with no parsed details HOLDs instead of throwing after the payment lock.
  - "Confirmed" callbacks are checked against the matched invoice.
- `24afb59` (Michael Wei), eight holes:
  - A denied callback marked the real vendor's address as known-bad.
  - A hung dial now ends as `no_answer`.
  - An approval cancelled mid-run is refused inside the lock.
  - A missing owner row skipped the TOTP replay check.
  - And four smaller ones.
- `63c309f` (Heechan Yang): end-to-end-run fixes. Cancel now checks the atomic `payStartedAt`
  lock.

---

## 9. My contribution (Aaryan Ved Bhalla, P1)

**Source:** `git log --no-merges --author` and `git blame --line-porcelain` (all lines, including blank ones) on 2026-10-25. Totals: 26 non-merge
commits and 10,352 lines added. All my commits were made with Claude Code (trailer present).

### Files I wrote (100% of current lines by blame, or created by me)

- `convex/bank.ts`: 492/492 lines.
- `shared/bank/payload.ts` (119), `shared/bank/verify.ts` (73), `convex/lib/countersign.ts` (37).
- `app/bank/page.tsx` (367).
- `scripts/eval-intake.ts` (82).
- `shared/audit.ts` (42).
- `app/ui/AppShell.tsx` (168), and all of `app/ui/` (714 lines added).
- `DESIGN.md`.
- `docs/brand/` (logo and favicons).

### Majority by blame (file scaffolded by Shaurya Mittal, mostly written by me)

| File | My lines (blame) | Shaurya's lines |
|---|---|---|
| `shared/policy/engine.ts` | 181 of 277 | 74 (Michael Wei 22) |
| `convex/pipeline.ts` | 217 of 382 | 149 (Michael Wei 16) |
| `scenarios/scenarios.json` | 206 of 274 | 68 |
| `scenarios/world.ts` | 134 of 165 | 31 |
| `scripts/live-scenarios.ts` | 182 of 203 | 21 |
| `convex/lib/claude.ts` | 126 of 154 | 28 |
| `shared/reply.ts` | 67 of 98 | 28 (Michael Wei 3) |
| `shared/intake/prescan.ts` | 65 of 82 | 17 |

### Minority share

- `convex/schema.ts`: 55 of 257 lines.
- `shared/types.ts`: 20 of 237.
- `convex/cases.ts`: 76 of 191.
- `convex/agents/intake.ts`: 23 of 66.

### By area (share of lines added)

| Area | My share |
|---|---|
| `shared/policy` | 68% |
| `convex` top level | 50% |
| `scenarios` | 77% |
| `shared/intake` | 76% |
| `scripts` | 87% |
| `shared/bank`, `app/bank`, `app/ui` | ~100% |
| `app/components` | 61% (UI redesign) |
| `README.md` | 66% |
| `app/owner` | 32% |
| `app/try` | 23% |

### My commits, by theme

- **Policy Engine, intake, pipeline, answer key, CI:** `9a21a4a`, `de25547`, `a14874f`.
- **Pipeline integration tests:** `66bbfa4`.
- **Watchdog and live rehearsal:** `fe00547`.
- **R3 hardening:** `f22ddc7`.
- **Judge Q&A:** `97fca67`.
- **Lumen Bank:** `780cad0`, `4c0afed`, `5dc020a`, `5cc7708`.
- **App UI redesign and design system:** `f75cdcc` through `5ef8fc8` (9 commits).
- **README, brand and logo:** `4a316ee`, `bc0a3b2`, `73d7667`.
- **Docs:** `422a784`, `bb37d43`.

### Not mine

Credit for these belongs to teammates:

- **Michael Wei (99% of lines added):** all of `shared/verification/`, the Moss and CRS
  integrations, and the Risk Analyst.
- **Shaurya Mittal:**
  - Voice and Cartesia: 68% of `convex/channels/` and `convex/agents/callbackVerifier.ts`.
  - Email: 100% of `shared/email/`.
  - The `/demo` landing page (94%) and the `video/` demo (100%).
  - The initial scaffold.
- **Heechan Yang:** Owner Concierge, `shared/totp.ts`, the Payer and Increase integration, and
  `fetch-agents/` (83%).

---

## 10. Honest ledger

- **No real money and no real bank.** Lumen Bank is a sandbox inside the same Convex deployment as
  the signer. The README says that in production "the bank holds only the public key and the signer
  runs in its own isolated service". That is not built.
- **Fictional world.** The company, owner and vendors are seeded data (`convex/seed.ts`), and the
  scenario addresses use reserved `*.example` domains.
- **No users, no auth for viewers.** The War Room and `/owner` are public pages. Owner actions are
  gated only by a TOTP code.
- **OFAC (R8) never fires live,** because the team's CRS account has no OFAC or KYB product. CRS is
  used only for email-risk scoring.
- **WhatsApp is not connected** to a real Meta app (`docs/whatsapp-setup.md`).
- **Fetch.ai agents:** the code remains in `fetch-agents/` and the agent bridge, but it was removed
  from the docs. Whether it runs anywhere is UNVERIFIED.
- **Increase sandbox rail:** implemented but not shown to have run live (UNVERIFIED). The default
  rail is Lumen Bank.
- **Email attacks on /try are simulated.** They are crafted webhook payloads, labelled "Simulated"
  in the UI.
- **Countersign never sends email.** Email replies are unsent drafts.
- **Cartesia limits:**
  - US-only outbound calls.
  - No SMS.
  - Reply wording varies from run to run.
  - A compromised vendor phone can fool the callback. This is mitigated by owner approval for bank
    changes, R4 and cooling-off, not eliminated.
- **The model classifies the vendor's callback answer;** code then requires the matching invoice
  number.
- **Actions are not transactional.** Retries rely on idempotency keys.
- **`audit.verifyChain` rereads the whole log** on every change. That's fine for a demo but would
  not scale.
- **Live evaluations not repeatable from saved artifacts:** `eval:intake` has no stored results,
  and the 28/28 live rehearsal was not re-run since email and the bank were added. 39 scenarios now
  exist versus 28 live-tested.
- **No coverage, load, bundle or end-to-end UI tests.**
- **Stale or inconsistent details:**
  - The `.github/workflows/ci.yml` comment says "30-scenario answer key"; there are now 39.
  - `package.json` declares `"license": "MIT"`, but there is no LICENSE file.
  - The demo video under `video/` predates the logo change and shows the old padlock.
- **Hard-coded demo values:** policy limits are in `shared/config.ts`, and the phone number is in
  `app/demo/sections/Sections.tsx` (`PHONE_DISPLAY`).

---

## 11. Resume & pitch material (derived only from the sections above)

### Resume bullets

- Kept AI agents from ever approving a fraudulent payment, as measured by 0 false PAY decisions
  across a 39-scenario answer key (26/26 scams blocked, 13/13 legitimate bills paid or escalated)
  and 28/28 scenarios on a live deployed pipeline. I did this by designing a deterministic
  18-rule TypeScript Policy Engine that is the only code path able to release money, with Claude
  limited to parsing and replies. [6, 8, 9]
- Built a sandbox bank that refuses any transfer the rules engine did not authorize, as measured by
  4/4 forged, tampered or replayed transfers rejected. I did this with ECDSA P-256
  countersignatures over canonical JSON, single-use nonces, a 2-minute expiry, and import-guard
  tests that allow only one module to touch the signing key. [6, 8, 9]
- Made a multi-agent payment pipeline survive model and runtime failures, as measured by a live
  rehearsal that surfaced a stuck-forever crash and then passed 28/28 scenarios. I did this by
  building an idempotent Convex step function with a watchdog (90 s, at most 2 restarts, then fail
  closed), transactional exactly-once payment locking, and race-based LLM timeouts. [6, 7, 8]
- Grew the project's test suite to 1,126 passing tests across 38 files with CI on every PR, as
  measured by green GitHub Actions runs. My part was the Policy Engine tests (53), the
  pipeline integration tests run against an in-memory Convex backend (27), the bank tests and the
  scenario answer key. [7, 9]

### Project description (for applications)

Countersign is a payments gatekeeper for one-person companies, built by a team of four at Cal Hacks
13.0. AI agents take payment requests by phone, chat and email, and call the real vendor back on the
number already on file. Only a deterministic 18-rule engine can release money, and the sandbox bank
verifies that engine's cryptographic countersignature before moving anything. I owned the Policy
Engine, the case pipeline, the sandbox bank and the 39-scenario answer key it scores 0 false
payments on. [1, 6, 9]

### 30-second spoken pitch

"Solo founders lose money to fake 'our bank changed' invoices and cloned-voice wire requests
because there's no second person to approve payments. Countersign is that second signer. AI agents
answer the phone and read every request, and when something's new they call the real vendor back on
the number on file. But the AI can never move money. Only a plain-code rules engine can, and the
bank checks its cryptographic signature before paying. On our 39-scenario test set it blocked all 26
scams with zero wrong payments. I built that rules engine, the pipeline and the bank." [1, 6, 8, 9]
