# P4: War Room, owner approvals, payments, Fetch.ai agents

Everything a judge sees or touches outside the phone call: the War Room on the projector, the
owner's approval page, the Payer, and Countersign on Agentverse / ASI:One.

| Page | Who uses it |
| --- | --- |
| `/` War Room | Projector. Follows the newest case; click a case in the queue to pin it. |
| `/owner` | The teammate playing Priya, on their phone. Approve, decline, cancel; block or trust senders (each change needs a code). |
| `/judge-card` | Printable judge card (P2). Set `NEXT_PUBLIC_TRY_URL` for its QR code. |
| `/try` | Judge chat (P2). |

## One-time setup

Run the Convex commands once against dev and once with `--prod` for the demo deployment.

**1. Owner authenticator (required for any approval).** On a trusted laptop, with Priya's phone in hand:

```bash
npm run enroll:owner -- "Priya Raman"   # prints a new setup key and an otpauth:// link
# add it to Google Authenticator / 1Password / Authy on Priya's phone, then:
npx convex env set OWNER_TOTP_SECRET <setup key>
```

The secret lives only in Convex and in the authenticator app. Never commit it or paste it in chat.

**2. Agent bridge secret.**

```bash
npx convex env set AGENT_BRIDGE_SECRET "$(openssl rand -hex 24)"
```

**3. Increase sandbox (optional).** Without it every payment goes to the mock ledger, which always works.

```bash
npx convex env set INCREASE_API_KEY <sandbox key>       # sandbox keys only
npx convex run payments:provisionIncrease                 # finds/creates the account, funds it with a simulated wire
npx convex env set INCREASE_ACCOUNT_ID <accountId it printed>
# back to the mock ledger:  npx convex env remove INCREASE_API_KEY
```

Once Increase is configured, a failing Increase call is retried once and then the case HOLDs and the
owner is alerted. It never silently falls back to the mock ledger. Test one Northwind payment after
setting it up.

**4. Fetch.ai agents.**

```bash
cd fetch-agents
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
cp .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"   # once per seed; put them in .env
# CONVEX_SITE_URL = NEXT_PUBLIC_CONVEX_SITE_URL from .env.local; AGENT_BRIDGE_SECRET = the value above
python countersign_agent.py
```

On first run the log prints the agent address and an Agent Inspector link. Open the link, click
**Connect**, choose **Mailbox**. Put the address in `COUNTERSIGN_AGENT_ADDRESS` and in the agents
table in `fetch-agents/README.md`, which is also the README Agentverse shows (it carries the
`innovationlab` and `hackathon` badges). Then, in a second terminal:

```bash
python vendor_billing_agent.py   # sends one payment request to Countersign on startup
```

In ASI:One (asi1.ai), turn on Agents and search for Countersign or paste its address. Register the
agent with the Fetch.ai Submission Agent as the hackpack describes.

## How the owner step-up works

- The pipeline escalates (R2 after a confirmed callback, R4, R6, R7, R11, R14, R15) and calls
  `ownerConcierge.requestApproval`. An approval row appears on `/owner` and the Owner Concierge lane
  shows "running" until the owner acts.
- Approve, decline and cancel each need the current 6-digit code from the authenticator app.
  Convex checks it (±30 s), rejects a code that was already used, and locks the approval for 60 s
  after 5 wrong codes.
- Approve sets `coolingOffUntil` when R7 asked for one. The Policy Engine holds until then and the
  pipeline wakes itself up and pays. Cancel works until P1's payment lock (`payStartedAt`) is taken.
- In ASI:One the owner says `pending`, then `approve <ref> <code>`. The same code check applies,
  because ASI:One's sender address is ASI:One's, not the owner's. A request that arrived over the
  agent channel cannot be approved over the agent channel.
- Owner alerts are `owner.notified` audit events, shown in the `/owner` feed.

## How the Payer works

- Runs only after the Policy Engine returned PAY and the pipeline took the payment lock. It refuses
  again unless the case's `policyResult` says PAY, the invoice is open and belongs to the vendor, and
  the amount matches.
- Destination = the vendor record's routing number and last 4. Never the request.
- Idempotency key `vendorId:invoiceNumber`: one non-failed payment per invoice. The same key goes to
  Increase as `Idempotency-Key`, so a retried call cannot create a second transfer.
- Each sent payment writes `Dr Accounts Payable · vendor / Cr Cash · Operating` to the audit log; the
  War Room shows the same lines and the rail used.

## Agent bridge (Convex HTTP actions)

Every route needs `X-Agent-Bridge-Secret`. Only `fetch-agents/countersign_agent.py` calls them.

| Route | Does |
| --- | --- |
| `POST /agent/message {sender, text, msgId}` | Opens an `agent` case (deduped on `msgId`, 10 per sender per minute) |
| `GET /agent/case?id=` | Status, decision, reply and rules for an agent-channel case |
| `GET /agent/pending` | Cases waiting for the owner, with their short refs |
| `POST /agent/approval {ref, code, action}` | Owner approve / decline / cancel from ASI:One |

## Before the demo

1. Use a fresh prod deployment. A deployment that has audit events written before P1's
   sorted-key hashing landed shows "Audit chain broken" in the War Room.
2. `npm run seed` on prod, enroll Priya's authenticator against prod, and approve one test payment.
3. Keep the cooling-off at 60 s (demo policy) so a cancel can be shown live.
4. Print `/judge-card`.

## Testing locally without a Convex login

```bash
CONVEX_AGENT_MODE=anonymous npx convex dev   # local backend on 127.0.0.1:3210, writes .env.local
```

## Known limits

- After approving, the owner must wait for the next code (up to 30 s) to cancel: a used code is
  rejected by design.
- Anyone with the `/owner` URL can see what is waiting and can trigger the 60 s lockout with wrong
  codes. They cannot approve anything without the authenticator.
- The War Room and the owner page are public read-only views of fictional data; there is no login.
- Until P3's vendor verifier lands, every real request is an unknown vendor (R1), so PAY and
  ESCALATE only happen with seeded findings.
