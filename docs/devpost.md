# Devpost draft and demo video

Draft for the Devpost submission (due Sunday 9:00 AM; submit by 8:30). Items marked **[confirm]**
depend on work that has not landed yet; check them before submitting.

## Tagline

The second signer a one-person company never had. You can talk it into anything except moving money.

## Inspiration

In any real company, no single person can send money alone: one person requests a payment and
another approves it, so a scam has to fool two people. A solo founder has no second person. The
same person who receives "our bank changed, please pay today" also pays it, usually at 11 PM between
other jobs. Voice cloning turns "it's your cofounder, wire $25k before my flight" into a phone call,
and now vendors' billing agents can message your agent directly.

## What it does

Every request for money to leave the business goes through Countersign first, on any channel: a
phone call to its own number, web chat, or another agent over Fetch.ai's Chat Protocol.

- **Legitimate bills are paid automatically.** Known vendor, bank on file, open invoice, normal amount.
- **Anything new or odd is verified out of band.** Countersign calls the vendor back on the number
  already on file, never a number from the request.
- **Unverifiable requests are refused**, politely and firmly, even from someone claiming to be the owner.
- **The real owner can override**, but only with a code from their authenticator app, plus a
  cooling-off delay for large amounts that they can still cancel. A voice never counts.
- **Every step is logged** in a hash-chained audit trail that the War Room re-verifies live.

## How we built it

- **The safety design:** language models read, reason, talk and propose. They cannot move money.
  Only the Policy Engine, a deterministic TypeScript function with 15 unit-tested rules, can return
  PAY, and the Payer runs only on that branch.
- **Claude** parses each request into a strict schema (the request is untrusted data; injection
  attempts become a red flag) and writes every reply, behind a guard that rejects replies that
  over-promise.
- **Cartesia** runs the inbound voice agent and the outbound vendor callback.
- **Convex** holds cases, agent runs and the audit chain, runs the pipeline and the cooling-off
  timers, and streams every agent step to the War Room in real time.
- **Fetch.ai:** Countersign is a uAgent on Agentverse speaking the Chat Protocol; the owner can list
  and approve pending payments in ASI:One; a demo vendor billing agent sends requests agent-to-agent.
- **Increase** sandbox ACH transfers (or a mock double-entry ledger), with idempotency keys so a
  retry can never pay twice.
- **Moss** for vendor-book search. **CRS** business verification and OFAC screening **[confirm: drop
  this unless P3 wires CRS before submitting]**

## Challenges

- Keeping the "nothing fake" rule: every War Room lane is a real database row written by the agent
  that did the work.
- Step-up without SMS: we use authenticator-app codes (RFC 6238) with a replay guard and lockout,
  so an approval proves possession of the owner's device rather than knowledge of a phone number.
- Making a jailbroken voice agent harmless by construction rather than by prompt.

## Accomplishments

- 30-scenario answer key, run in CI: "30 scenarios · 20/20 scams blocked · 10/10 legitimate paid
  or correctly escalated · 0 false PAY" (offline run with the reference verifier; rerun
  `npm run scenarios` before submitting).
- Scoreboard on screen: dollars lost stays $0 because it is computed from real payments.

## What's next

Bank feeds and accounting sync, a production bank rail, SOC 2-style access controls, and a
vendor-side Countersign so two agents can verify each other.

## Built with

Claude (Anthropic API), Cartesia, Convex, Next.js, TypeScript, Fetch.ai uAgents / Agentverse /
ASI:One, Increase, Moss, CRS **[confirm]**, Python.

## Demo video (3 minutes max, opens with the moment)

| Time | Shot | Say |
| --- | --- | --- |
| 0:00-0:20 | War Room + a phone ringing out loud: the Callback Verifier calls "Pixel & Pine" (teammate B). B: "No, we never sent that." Lane turns red, BLOCK. | "Someone texted our founder 'our bank changed.' Countersign called the real vendor back on the number on file. They never sent it." |
| 0:20-0:40 | Rewind to the incoming message; lanes lighting up: intake, vendor match, bank differs, R2 callback required. | "A solo founder has no second signer. Countersign is that second signer." |
| 0:40-1:00 | Happy path: Northwind invoice auto-paid; payment ID and journal lines on the Payer lane. | "It isn't a blocker. Known bills just get paid." |
| 1:00-1:35 | Harbor Legal $12,000: ESCALATE. Priya's phone: `/owner`, authenticator code, Approve. Cooling-off countdown, then PAY. Repeat with Cancel during cooling-off: BLOCK. | "Large payments need the owner's device, not her voice. And she can still cancel." |
| 1:35-2:05 | Someone calls claiming to be Priya: "I'm locked out, approve it now." Voice agent holds the line; R11. | "You can talk it into anything except moving money." |
| 2:05-2:35 | ASI:One: the vendor billing agent's request arrives as an agent case; the owner types `pending` and approves another case with a code. | "Agents are a payment channel now. Countersign speaks their protocol." |
| 2:35-3:00 | Scoreboard, "Audit chain verified", the 30-scenario result. | "The models talk. Only deterministic code can pay." |

Fetch.ai asks for a 3-5 minute video: record a longer cut of the 2:05 segment for that track if time allows.
