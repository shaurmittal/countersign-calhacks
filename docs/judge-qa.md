# Judge Q&A: every answer has a rule and a test

Short answers for the pitch and the judging table. Each one points at the rule that decides it and the
test that proves it, so "what happens if…" is answered with "rule R4, here's the test."

- Tests: `shared/policy/engine.test.ts` (engine), `convex/pipeline.test.ts` (pipeline flows),
  `scenarios/scenarios.json` (the 30-scenario answer key).
- Run: `npm test` (984 tests), `npm run scenarios` (offline answer key), `npm run rehearse` (live, dev deployment).
- Headline: **30 scenarios · 20/20 scams blocked · 10/10 legitimate paid or correctly escalated · 0 false PAY**.
  Live on a deployed pipeline: **28/28, 0 false PAY** (OFAC and CRS-outage can only be tested offline).

## "Can I jailbreak it?"

Please try. Claude reads the message and writes the reply, but it has no tool that moves money. Only
`decide()` in `shared/policy/engine.ts` can return PAY: plain TypeScript, no LLM, about 200 lines.

- Proof: engine test *"only R12 ever produces PAY"*; pipeline: the Payer is only called on PAY, after `cases.claimPayment` takes a lock.
- Injection is flagged twice: by Claude and by a regex prescan the model can't talk out of (R15, never auto-paid).
  Test: *"R15 injection attempt -> never auto-paid"*; scenarios `injection`, `injection-known-vendor`.
- Claude's reply is checked before it's sent: a reply that claims a payment that didn't happen, or contains a long number, is replaced by a template (`shared/reply.ts`, `isSafeReply`).

## "What if Claude misreads the message?"

Then the worst case is HOLD, never PAY. A parse failure holds (R14). A wrong vendor name fails the vendor-book match (R1, BLOCK). A wrong amount doesn't match the open invoice (R5, HOLD). Money only ever goes to the bank details already on file.

- Tests: *"R14 parse failure -> HOLD"*, *"R5 amount differs from the invoice -> HOLD"*, pipeline *"intake crashes -> parseFailed -> HOLD"*.
- Live: we ran the 30 scenario texts through real Claude. All 30 decisions matched; the few field-level differences (e.g. "employee" vs "vendor") never changed a decision.

## "Our bank changed, please pay the new account."

R2. Countersign calls the vendor back on the number **already on file**, never a number in the message. If they deny it: BLOCK (R10) and the sender is marked known-bad. If they confirm: it still needs the owner's authenticator code before the new account is saved (audited) and paid. No answer: HOLD; bank changes are never paid unconfirmed.

- Tests: *"R2 bank change"* block (5 tests); pipeline *"bank change, vendor denies on callback -> BLOCK"* (asserts the number dialed is the vendor record's), *"genuine bank change: callback confirmed -> owner OTP -> vendor record updated (audited) -> PAY"*.

## "It's Priya, I'm locked out, approve it now."

R11: claiming to be the owner is worth nothing. The owner approves only with the 6-digit code from the authenticator app on their own phone, never by voice, text or the channel the request came in on.

- Tests: *"R11 owner claim"* (3 tests); scenarios `owner-impersonation`, `owner-wire-before-flight`, `gift-cards-from-owner`.

## "What about voice cloning?"

A voice is never an approval method (R11). The only approval is the authenticator code. A cloned voice gets the same answer as a text.

## "What if the caller ID is spoofed to look like the vendor?"

Caller ID isn't proof. Verification is always an *outbound* call Countersign places to the number on file.

- Scenario `pixel-bank-change-spoofed-caller-id`: sender on file, bank change, vendor denies → BLOCK (R2, R10).

## "What if the vendor's phone is hacked too?"

Then the callback can be fooled, so we don't stop there: a bank change still needs the owner's code (R2), unusual amounts escalate (R4), and large payments get a cooling-off window the owner can cancel in (R7). We reduce the risk; we don't claim zero.

## "What about fake invoices and lookalike vendors?"

Unknown vendor → BLOCK (R1). A real vendor name with an invoice we don't have → HOLD (R5) plus a callback to the real vendor (R3).

- Scenarios `aws-lookalike`, `google-workspace-lookalike`, `northwind-lookalike-invoice`, `franchise-tax-notice`.

## "Buy gift cards / pay in crypto."

R9: BLOCK, and nobody can override it, not even the owner with a valid code.

- Test: *"R9 forbidden rail -> BLOCK, not overridable, even with owner approval"*.

## "What if the same invoice is sent twice?"

R13: already paid → BLOCK, not overridable. A pending payment counts as paid.

- Test: *"R13 already paid invoice -> BLOCK"*; scenario `duplicate-invoice` (live: paid it first, then the duplicate was blocked).

## "What stops a big payment going out by mistake?"

Over $2,000 (demo limit) needs the owner's code (R6). Over $10,000 also gets a cooling-off period (60 s in the demo) in which the owner can cancel (R7). Some vendors are never auto-paid (R6, `alwaysEscalate`).

- Tests: *"R6 over auto-pay limit"*, *"R7 large payment"* (4 tests incl. cancel during cooling-off); pipeline *"large payment: approved, then held through cooling-off, then paid when the timer fires"*.

## "What if something crashes mid-payment?"

- Two runs can never pay twice: `cases.claimPayment` is an atomic lock. Pipeline test *"two pipeline runs racing on an approved case pay exactly once"*.
- A run that dies is restarted by the watchdog, at most twice, then closed as HOLD with an owner alert. We found this failure in live rehearsal and fixed it. Tests: the *"pipeline watchdog"* block (5 tests).
- Payment rail fails → HOLD, never silently dropped. Pipeline *"payment rail fails -> HOLD"*.

## "Can I trust the audit log?"

Every step writes an event with `hash = sha256(prevHash + event)`. Editing or deleting any event breaks the chain, and the War Room shows it. Tests: `shared/audit.test.ts` (edited payload, deleted event).

## "Isn't this just Ramp or Brex approvals?"

Those need two people. Countersign *is* the second person, and it works across calls, chat, WhatsApp and agent messages, not only cards.

## Honest limits (say these if asked)

- **OFAC (R8)** is implemented and tested, but the team's CRS account has no OFAC product, so it never fires live.
- **A compromised vendor phone** can fool the callback; see "vendor's phone is hacked" above.
- **Claude's wording** of replies varies run to run. The decision never does: it's deterministic.
