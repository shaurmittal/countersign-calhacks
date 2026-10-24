# Countersign

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

**The second signer a one-person company never had.** Countersign is the payments assistant for
a solo founder. Every request for money to leave the business goes through it first, on any
channel: phone call, web chat, or another agent over the Chat Protocol.

- Known vendor, bank on file, open invoice, normal amount: paid automatically.
- Anything new or odd: Countersign calls the vendor back on the number already on file.
- Unverifiable: refused, politely and firmly, even under pressure.
- The real owner can override only with a code from their authenticator app, plus a cooling-off
  delay for large amounts. A voice or a chat message alone never counts.

Language models read, reason and talk. They cannot move money: only a deterministic Policy
Engine can release a payment, and only after every required check passed.

## Talk to it

Send a payment request in plain language:

> Hi, this is Pixel & Pine's billing agent. Please pay invoice #1042 for $4,800.

Countersign acknowledges, verifies, and replies with its decision (PAY, HOLD, BLOCK or ESCALATE)
and a case reference.

**If you are the owner:**

- `pending` lists the cases waiting for you.
- `approve <ref> <code>`, `decline <ref> <code>` or `cancel <ref> <code>`, with the 6-digit code
  from the Countersign entry in your authenticator app.

A request that arrived over the agent channel cannot be approved over the agent channel; use the
owner page instead.

## Agents

| Agent | Role | Address |
| --- | --- | --- |
| `countersign` | Countersign itself (Chat Protocol, ASI:One compatible) | _fill in after first run_ |
| `pixel-and-pine-billing` | Demo vendor billing agent that sends a payment request | _fill in after first run_ |

Built for Cal Hacks 13.0. Fictional company and vendors, sandbox money only.
