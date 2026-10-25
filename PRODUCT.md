# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **The solo founder (Priya Raman, owner of the fictional Lumen Labs).** Receives payment requests on every channel, usually late and between other jobs. Uses `/owner` on her phone to approve or decline with a code from her authenticator app, and the War Room to see what Countersign did.
- **Hackathon judges (Cal Hacks 13.0).** Watch the War Room projected on stage during a 2-minute live demo, and try to scam Countersign themselves at `/try`, by phone or by email.
- **Teammates playing roles.** The vendor answering the callback, the owner approving on their phone.

## Product Purpose

Countersign is the second signer a one-person company never had. Every request for money to leave the business goes through it first. Known bills are paid automatically; anything new or odd is verified out of band (a callback to the number already on file); unverifiable requests are refused; the real owner can override only with an authenticator code. Success: dollars lost stays $0 while legitimate bills still get paid.

## Positioning

"You can talk it into anything except moving money." Language models read, reason, talk and propose, but only a deterministic Policy Engine (`decide()`, plain TypeScript, rules R1–R18) can return PAY, and Lumen Bank, the sandbox bank, moves money only for a transfer that PAY countersigned (ECDSA P-256).

## Operating Context

- Channels: a phone line (Cartesia voice agent), web chat at `/try`, email (Postmark inbound), and agent-to-agent messages (Fetch.ai Chat Protocol).
- A case flows: intake (Claude) → vendor verifier ∥ risk analyst → Policy Engine → callback / owner approval / payer → reply. Each step is a real database row shown as a lane in the War Room, updating live (Convex).
- Decisions: PAY, HOLD, ESCALATE, BLOCK, NO_ACTION. Every step writes to a hash-chained audit log the War Room re-verifies.
- Surfaces: War Room `/` (live case, agent lanes, queue, scoreboard, audit), `/owner` (approvals, alerts, block/trust lists, bank-detail changes), `/bank` (Lumen Bank balance, payees, hijacked-agent simulation, transfer ledger), `/try` (judge chat with scam presets), `/demo` (landing film, separate visual world, not part of the app redesign), `/judge-card` (printable, light).

## Capabilities and Constraints

- Next.js 16 App Router, React 19, Convex React hooks; every number on screen comes from real Convex rows ("nothing fake").
- Owner step-up is a 6-digit TOTP code; voice is never an approval.
- Bank details are shown only as routing plus last 4.
- Team-owned files: War Room and `/owner` are P4's, `/try` is P2's, `/bank` is P1's. Code freeze 4:30 AM Sunday Oct 25, 2026.

## Brand Commitments

- Name: Countersign. Tagline: "The second signer a one-person company never had."
- Logo: a padlock with a check mark (inline SVG, `LogoMark` in `app/ui/AppShell.tsx`).
- Fictional world: Lumen Labs, Priya Raman, vendors Northwind Cloud, Pixel & Pine Design, Harbor Legal, Sam Ortiz.
- User-pinned for the app UI redesign (Oct 24, 2026): OLED black background, white as the secondary color, green for approvals, red for rejections, otherwise restrained color; reference and components from easyui.site.

## Evidence on Hand

- 39-scenario answer key: "26/26 scams blocked · 13/13 legitimate paid or correctly escalated · 0 false PAY" (`scenarios/scenarios.json`, `npm run scenarios`).
- 1,100+ automated tests; live War Room data on the demo deployment.
- No customers, testimonials or production usage exist; never invent them.

## Product Principles

1. The models talk; only deterministic code can pay. The UI should make that separation visible.
2. Nothing fake: every lane, number and badge is a real row.
3. Color carries decisions, not decoration: approval and refusal must read instantly.
4. Honest limits: sandbox bank, fictional company, simulated email attacks are labelled as such.
