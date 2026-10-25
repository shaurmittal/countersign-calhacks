# Countersign demo video: script

**Length: 1:28 (hard cap 1:30).** Voiceover: Cartesia Sonic, narrator "Quentin", one file per scene
(`assets/vo/NN-*.wav`). `npm run vo` generates them from the `VO` table in `scripts/voiceover.ts`, which
mirrors the lines below. Every number on screen comes from the repo or the live deployment; sources are
listed at the bottom.

| # | Time | Scene | Words |
| --- | --- | --- | --- |
| 1 | 0:00-0:10 | Cold open | 0 (real call audio only) |
| 2 | 0:10-0:15 | Title | 14 |
| 3 | 0:15-0:24 | The problem | 18 |
| 4 | 0:24-0:47 | How it works | 47 |
| 5 | 0:47-0:59 | The core design | 33 |
| 6 | 0:59-1:09 | It's not a blocker | 21 |
| 7 | 1:09-1:19 | Proof | 17 |
| 8 | 1:19-1:28 | Built with and close | 18 |
| | | **Total** | **168** |

## 1. Cold open (no narration)

- Black. An incoming-call card: "Pixel & Pine · calling Countersign".
- **Real audio** (inbound call, case …8gx7rm): *"Our bank has changed. Can you send invoice 1042 to the account ending 9921?"*
- Hard cut to the War Room lighting up (real footage).
- A waveform: "Calling Pixel & Pine · number on file".
- Half a second of silence.
- **Real audio** (callback): *"No, we never sent that."*
- **BLOCK** slams in, with a hit.

## 2. Title

COUNTERSIGN, letterboxed. "The second signer a one-person company never had."

> That call almost cost a founder four thousand eight hundred dollars. Countersign caught it in fifty seconds.

## 3. The problem

Kinetic type: "Companies: two people approve every payment." Then "Solo founders: one person, 11 PM."

> In a company, two people approve every payment, so a scammer has to fool both. A solo founder has nobody.

## 4. How it works

Real War Room footage: zooms into each agent as it lights up, a glowing path, a punch-in on "new bank ≠ file", and the callback lane.

> Countersign answers every call, email and message for her. AI agents read the request, check the vendor book and flag the risk. Then it does what a careful accountant would. It never calls the number that called it. It calls the number it already trusts, and the real vendor says no.

## 5. The core design

Diagram: "AI agents · read, reason, talk" | a locked "Policy Engine · 17 rules, plain code" | "the only path to money". Then `/bank` rejecting a hijacked agent.

> The AI can read, reason and talk. It cannot move money. Only seventeen rules in plain code can, and the bank checks their signature. You can talk it into anything, except moving money.

## 6. It's not a blocker

Real footage: `/try` "Pay Northwind #NW-889" → PAY; `/owner` approval with an authenticator code.

> Real bills still get paid on their own. Bigger ones wait for a code from the owner's own phone. Never a voice.

## 7. Proof

Real footage: `/demo` "Run all 39" counting up; the War Room audit trail.

> Thirty-nine attack scenarios. Every scam stopped. Zero wrong payments. Every step in a chained audit log.

## 8. Built with, and close

A name wall (Cartesia · Claude · Convex · Moss · CRS · Fetch.ai), then letterboxed "+1 (256) 215-6932 · Try to scam it." Small print: "Fictional company and vendors. Real calls, real verification, sandbox payments."

> Built with Cartesia, Claude, Convex, Moss, CRS and Fetch.ai. Call our number. Try to scam it.

## Sources for every claim

| Claim | Source |
| --- | --- |
| $4,800; caught 50 s after the case opened | Case …8gx7rm: invoice 1042 = $4,800.00; `CASE_ANCHORS` in `app/demo/film/story.ts` (BLOCK at real T+50.0 s) |
| "No, we never sent that." | Callback transcript, clip `public/demo/audio/c07-vendor-denial.mp3` |
| Every call, email and message | `convex/channels/` (voice, email, web, agent) |
| 17 rules in plain code; the bank checks their signature | `shared/policy/rules.ts`, `shared/policy/engine.ts`, `shared/bank/verify.ts` |
| A code from the owner's own phone | `/owner` TOTP approval (RFC 6238), `shared/totp.ts` |
| 39 scenarios, every scam stopped, 0 false PAY | `npm run scenarios` → "39 scenarios · 26/26 scams blocked · 13/13 legitimate … · 0 false PAY" |
| Chained audit log | `convex/audit.ts`, re-verified live in the War Room |
