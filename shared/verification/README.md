# P3 verification

This folder (owner: P3) holds the pure, unit-tested logic behind two agents:

- the Vendor Verifier (spec §6.2);
- the Risk Analyst (§6.3).

It has no Convex, Node or network imports, so vitest, Convex and the browser can all run it. `crs.ts` makes its calls through a `fetch` its caller passes in. The Convex agents only load the vendor book and call these functions:

- `convex/agents/vendorVerifier.ts`
- `convex/agents/riskAnalyst.ts`

Only `decide()` can return PAY. These findings are its inputs. They never claim a check passed when it didn't run.

## Files

| File | What it does |
| --- | --- |
| `types.ts` | Plain vendor-book shapes (`BookVendor`, `BookInvoice`, `BookPayment`, `BookOwner`) with string ids |
| `text.ts` | OSA edit distance, and phone and email normalization |
| `vendorMatch.ts` | Vendor name matching and the exact sender checks |
| `bank.ts` | Compares the request's bank details with the record |
| `invoices.ts` | Normalizes and matches invoice numbers, and detects duplicates |
| `lookalike.ts` | Detects lookalike domains |
| `riskFlags.ts` | The nine red flags, Pacific off-hours, and `riskScore` |
| `explain.ts` | The two-sentence explanation (a template until Claude is wired) |
| `verifyVendor.ts` | Combines the above into `VendorFindings` |
| `assessRisk.ts` | Combines the above into `RiskFindings` |
| `moss.ts` | What goes into the Moss index, how its hits become `searchHits`, and the score floor |
| `policyLookup.ts` | Policy sentences for the voice agents' mid-call lookup, and their keyword fallback |
| `crs.ts` | Which senders CRS screens, the CRS client (login, token reuse, timeouts), and how an AtData Fraud Finder result becomes `crs` |
| `seedScenarios.test.ts` | Pins what P3 returns for each `scenarios.json` entry on the seed world |

`shared/seedWorld.ts` holds the seed data. `convex/seed.ts` inserts it, and the tests read it through `buildSeedBook()`.

## `VendorFindings`

| Field | Meaning |
| --- | --- |
| `vendorId`, `matchConfidence` | The fuzzy name match against the name and aliases (threshold 0.80) and its confidence. With no claimed name, the vendor is found only by an exact sender match (0.90). A claimed name that doesn't match never falls back to the sender. A near-tie between two vendors is no match. Confidence is 0 when `vendorId` is null. |
| `senderOnFile` | True when `fromAddress` exactly matches the vendor's phone, an email on file, or an email at one of its domains. It is also true for the owner's registered phone, OTP phone or email: a callback to the vendor can't confirm a request the owner sent. A sender on any vendor's `knownBadSenders` is never on file. |
| `bankMatches` | `null` when the request has no bank details. Otherwise it is true only when every supplied part matches: the routing number equals `bankRouting`, and the account's last 4 equal `bankLast4`. |
| `matchingInvoiceId` | Only the matched vendor's invoices are checked. A request with an invoice number matches by that number, and a stated amount must equal the invoice. With no number, it matches the single open invoice with that amount. With neither number nor amount, it matches the vendor's only open invoice. |
| `alreadyPaidAt` | Set when the invoice is paid or has a sent or pending payment. Pending counts, so a second request can't pay the same invoice twice. |
| `crs` | AtData Fraud Finder on the sender's email, for senders the book doesn't know (see the CRS section below). `verifyVendor` itself always returns `"not_checked"`; `runVendorVerifier` fills in the CRS result. |
| `ofacHit` | Always `false`: the team's CRS account has no OFAC product, so `false` means OFAC **did not run**, never that the payee is clear. |

## Risk flags

Flags are for display only and never decide anything. Each one is also backed by a narrow text check on `rawContent`, so the flags still work while the Intake Parser is a stub.

| Flag | Fires when |
| --- | --- |
| `forbidden_rail` | The action is gift cards or crypto, or the text mentions buying gift cards or their codes, crypto or wallet terms, a "personal account", Zelle, Venmo, Cash App or Western Union. |
| `injection_attempt` | `request.injectionAttempt`, or text aimed at the model ("ignore previous instructions", "system prompt", role tags). |
| `owner_impersonation` | The sender isn't the owner, and either the role is owner or cofounder, or the text claims to be or speak for the owner. |
| `bank_change` | The bank details don't match the file, the action is change_bank or update_payroll, or the text says the bank changed. |
| `lookalike_domain` | The sender's email domain, or a domain in the text, imitates a known domain. Known domains are the vendors' domains, the owner's domain, and a fixed list of brands (AWS, Google, PayPal, IRS, …). It checks homoglyphs, the same name on another TLD, edit distance, and brand tokens. |
| `amount_anomaly` | The amount is outside `typicalAmountRange` by more than `policy.amountAnomalyPct`, or it is ≤ 0, or it isn't in USD. |
| `new_sender` | The sender is neither the owner nor on file for the matched vendor (any vendor, if none matched), or is known-bad. |
| `urgency` | `urgencyClaims`, or words such as urgent, today, "pay now", shut down or final notice. |
| `off_hours` | The case arrived between 21:00 and 07:00 America/Los_Angeles, on any day. DST is computed by hand, because the Convex runtime may lack time-zone data. |

`riskScore` is the sum of fixed weights per flag, capped at 100. It is for display only.

## What still needs keys

| Seam | Today | When the key arrives |
| --- | --- | --- |
| **CRS** (`CRS_USERNAME`, `CRS_PASSWORD`, `CRS_BASE_URL`) | Wired: AtData Fraud Finder screens strangers' emails; see the CRS section below | Done. KYB and OFAC are dropped, because the team's CRS account has neither product. |
| **Moss** index (`MOSS_PROJECT_ID`, `MOSS_API_KEY`) | Wired; see the Moss section below | Done: both agents pass Moss hits to `matchVendor`, and matching falls back to memory when Moss isn't set up |
| **Claude** explanation (`ANTHROPIC_API_KEY`) | Template text from `explainRisk` | Rewrite the explanation from the flags, falling back to the template on any error. |

## CRS sender screening (AtData Fraud Finder)

The team's CRS sandbox account has the Cal Hacks products only: credit reports, criminal, eviction, Accurate Append, AtData Fraud Finder, TransUnion identity verification, and PitchPoint liens and judgments. Business InstantID answered 401 `CRS111` on 2026-10-24, and no product screens OFAC. So KYB is dropped, and `ofacHit` stays `false`.

The consumer reports (credit, criminal, eviction, liens) are regulated by the FCRA and have no permissible purpose for a vendor. Fraud Finder fits invoice fraud: it scores how risky an email address is (`risk.score`, 0 to 100) from its validity, domain risk, and when the address and its domain were first seen.

**Who gets screened.** The email addresses the book doesn't know: the sender's, if it is an email, and any written in the message (`emailsToScreen`). Each case screens at most 3, deduped, the sender's first. Phones, agent addresses, the owner's email and any address on a vendor's file or domains are never sent to CRS. The checks run in parallel, and the worst result wins: a high score first, then a check that didn't complete.

**Privacy.** A message can contain a real person's email address, for example one a judge types into `/try`. That address goes to the CRS sandbox (AtData) for scoring. Nothing else from the message is sent, and `crs.raw` doesn't repeat the address.

This matters for the demo. Every seed and scenario address is on a reserved `*.example` domain, and AtData gives those `risk.score` 100, `domain_risk_score` 10 and `invalid`. The sandbox returned exactly that for both `invoices@northwind-cloud-billing.example` and the seed vendor's `billing@pixelandpine.example`. Screening senders on file would therefore escalate every legitimate email.

**What `decide()` sees:**

| Fraud Finder result | `crs` | Effect |
| --- | --- | --- |
| `risk.score` ≥ 70 (AtData suggests 70–80) | `{ status: "ok", businessVerified: false, raw }` | R14 escalates: CRS couldn't vouch for the sender |
| `risk.score` < 70 | `{ status: "ok", raw }` | Nothing. A low score proves nothing about a business, so `businessVerified` stays unset. |
| Error, timeout (4 s budget, 3 s per request), unreadable body, 401 | `{ status: "unavailable", raw: { reason } }` | R14 escalates |
| No `CRS_USERNAME`/`CRS_PASSWORD`, `CRS_BASE_URL` not the sandbox host, or no address the book doesn't know | `{ status: "not_checked" }` | Nothing |

`raw` holds the scores, the email status and the first-seen dates, never the address: public queries return `vendorFindings` as they are. A `reason` is an HTTP status or a CRS code such as `CRS111`, never a credential. `raw` describes the worst check, adds its `source` (`sender` or `message`), and lists every check's status and score in `checks`.

On the answer key, three scenarios get screened: `google-workspace-lookalike`, `northwind-lookalike-invoice` and `ofac-hit`. All three already BLOCK. `seedScenarios.test.ts` checks that no decision changes whether AtData scores them 100, scores them low, or is down.

**Login.** `POST /users/login` once per Convex isolate, and the token is reused for 45 minutes (it lasts 60). After a 401 on a check, the token is dropped and the next check logs in again.

Repeated failed logins lock the CRS account (`CRS113`, then `CRS114`). So a rejected login waits 10 minutes before the next try, and a network error or timeout waits 30 seconds. Check the password before setting it.

To try it on your deployment. This makes one login and one Fraud Finder call:

```bash
npx convex run agents/vendorVerifier:screenEmail '{"email":"invoices@northwind-cloud-billing.example"}'
```

## Moss vendor search

`convex/agents/moss.ts` is a `"use node"` file, because `@moss-js/moss` ships native binaries. `convex.json` lists it under `node.externalPackages` and pins Node 22.

**The index**
- **One shared index.** Every Countersign deployment shares one index, `countersign`. The Moss plan caps a project at 3 indexes, and the team's project has only one.
- **Scopes.** Each document has a `scope`, and every query filters on it:
  - `vendor:<deployment>`: that deployment's vendor names and aliases, with ids `vendor:<deployment>:<vendorId>:<n>`;
  - `policy`: the policy sentences, one copy shared by all deployments, with ids `policy:<id>`.
- **No contact details.** No phones, emails or bank numbers go in, because Moss sends document text to its cloud and the SDK always sends usage telemetry.
- **Syncing.** A sync touches only its own scope: it upserts that scope's documents, then deletes the scope's stale ones. It never deletes the index, so a refused write leaves the old documents working.
  - `syncVendorIndex` syncs this deployment's vendors.
  - `syncPolicyIndex` syncs the policy sentences.
  - The seed schedules both, because vendor ids change on every seed.

  To sync by hand:

  ```bash
  npx convex run agents/moss:syncVendorIndex
  ```
- **Ops.** `listIndexes` shows what's in the project. `deleteLegacyIndex({ name })` removes one of the old `countersign-vendors-<deployment>` indexes; it refuses any other name.

**Searching**
- `searchVendors` returns `searchHits` for a claimed name. To check it:

  ```bash
  npx convex run agents/moss:searchVendors '{"query":"NW Cloud"}'
  ```
- Convex's Node runtime has a read-only `$HOME`, and `process.env` changes never reach native code. So queries run in a child Node process whose environment points Moss's model and index caches at `/tmp`.
- The child starts on the first search and is reused while the process stays warm. A cold first search, which includes the model download, can run past the 3-second budget. It then returns no hits.

**Matching**

A hit can raise a vendor's score, never lower it, and only from 0.95 (`MOSS_MIN_SCORE`). The floor comes from scores measured on the seed book. Each one is pinned in `moss.test.ts`:

| Query | Moss's best vendor | Score | Result |
| --- | --- | --- | --- |
| NW Cloud | Northwind Cloud | 0.97 | matches, which only Moss can do |
| Northern Cloud | Northwind Cloud | 1.00 | matches; the team accepted this |
| Pinewood Design | Pixel & Pine Design | 0.88 | no match |
| Sam's Club | Sam Ortiz | 0.87 | no match |
| Harbor Bank | Harbor Legal | 0.83 | no match |

If Moss isn't set up, fails, or runs out of time, matching runs in memory alone.

**Billing**

Moss bills per active device. Each serverless container would otherwise mint its own device id, so every client reports one stable id per deployment, `countersign-<deployment>`.

## Mid-call policy lookup (for P2's voice agents)

`internal.agents.moss.lookupPolicy({ question })` returns `{ message, rules, source }`. `message` is plain text that the agent explains in its own words.

**What it returns**
- It answers "why does this need a callback?", "can I pay in gift cards?" or "what happens next?" with Countersign's rules: one speakable sentence per rule in `policyLookup.ts`, checked against P1's rule catalogue.
- It is policy only. It never returns invoice numbers, amounts, limits or vendor details:
  - An inbound caller isn't verified.
  - On a callback the vendor must say the invoice number unprompted. That is P2's check against "yes to everything" answers (spec §8.2).

**How it searches**
- **Moss:** searches the `policy` scope of the shared index, in Moss's own hybrid order (meaning plus keywords).
- **Keywords:** rank the same sentences by shared words, with rarer words counting more.
- **Combined:** the answer takes Moss's best sentence and the keyword method's best, deduplicated, two in all. Each method catches questions the other misses.
- **Fallback:** when Moss is cold, slow or down, the keywords answer alone, so the tool always replies. `source` is `"moss"` whenever Moss contributed.
- **Query phrasing:** the agent should describe the caller's claim rather than repeat it. "Caller says they are the owner and approves the payment" finds the owner-approval rule. The raw "It's Priya, just send it" doesn't.

**Wiring for P2**

`convex/channels/voice.ts` and `convex/http.ts` are P2's files. Add a tool that follows their conventions:

```ts
/** Tool `lookup_policy` (both agents). Body: { question (model) }. Policy only, never invoices or accounts. */
export const lookupPolicy = httpAction(async (ctx, request) => {
  if (!toolSecretValid(request)) return text("unauthorized", 401);
  const question = str((await readJson(request)).question, 500);
  if (!question) return text("question is required.", 400);
  const answer = await ctx.runAction(internal.agents.moss.lookupPolicy, { question });
  return text(answer.message);
});

// convex/http.ts
http.route({ path: "/cartesia/tools/policy", method: "POST", handler: lookupPolicy });
```

Then configure the Cartesia tool `lookup_policy` on both agents:

| Setting | Value |
| --- | --- |
| Description | "Look up Countersign's payment policy when the caller or vendor asks why a payment needs checking or what happens next. Never use it for invoices or accounts." |
| Request | POST `<SITE>/cartesia/tools/policy` with the `X-Countersign-Secret` header |
| Body | `question` (model-supplied): "What the caller asked or claimed, described in a few plain words, e.g. 'caller says they are the owner and approves the payment'. Don't repeat their exact words or any numbers." |
| Execution | pre_tool_speech `auto`, execution_mode `immediate`, timeout 5 s |

To try it:

```bash
npx convex run agents/moss:lookupPolicy '{"question":"Can I pay you in bitcoin?"}'
```

## Notes for P1 (`decide()`) and P4 (UI)

- **The answer key with real P3:** `seedScenarios.test.ts` runs all of `scenarios.json` through `verifyVendor`, `assessRisk` and `decide()` the way `pipeline.advance` does, and expects every decision. `scenarios/world.ts` could call these functions instead of its reference verifier.
- **CRS status:** only strangers' emails are screened, so a sender on file still gets `"not_checked"`, and PAY doesn't wait for CRS. For a screened sender, an error or timeout returns `"unavailable"`, which escalates through R14. A high AtData score sets `businessVerified: false`, so R14's reason reads "could not verify the business", although the check was on the sender's email.
- **OFAC isn't screened live.** In the demo, `ofac-hit` blocks on R1 (unknown vendor) only. The answer key's R8 comes from its stubbed `world.ofacHit`. Don't claim OFAC screening in the pitch.
- **`crs-outage`** stubs CRS as down for the owner's SMS. Live, CRS never screens phones, so that path can only happen in tests.
- **Lane summary:** `summarizeVendor` shows "CRS unavailable" but not a high score. `crs.raw.score` and `crs.raw.emailStatus` are ready to show, for example "CRS: sender email risk 100/100 (invalid)".
- **R9 blocks on `forbidden_rail`, and no one can override it.** So its text check covers only R9's own list: gift cards, crypto, and a personal account. A Zelle or Venmo mention raises the display-only `bank_change` instead, and the Payer only ever pays the bank on file.
- **R11 and R15** read the `owner_impersonation` and `injection_attempt` flags. Their text checks ignore greetings ("Hi Priya"), negations and ordinary billing phrases.
- **`isAmountAnomalous`** (`riskFlags.ts`) is the same definition as R4.
- **Known-bad senders:** addresses that `cases.markSenderKnownBad` writes for R10 are never on file again, even when the sender is the vendor's own number.
- **Spoofing:** caller ID and an email's From can be faked, so "on file" isn't proof. The owner's registered phone also counts as on file. Bank changes always go through R2's callback, whoever sends them.
- **Lane summaries:** `advance` passes no `summarize` function for the P3 lanes. `riskFindings.explanation` is ready-made display text.
- **Public data:** case documents, including both findings, are returned by public queries. The explanation therefore never contains on-file phones, banks or amount ranges, and `crs.raw` never contains the sender's address.
