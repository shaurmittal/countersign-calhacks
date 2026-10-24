# P3 verification

This folder (owner: P3) holds the pure, unit-tested logic behind two agents:

- the Vendor Verifier (spec §6.2);
- the Risk Analyst (§6.3).

It has no Convex, Node or network imports, so vitest, Convex and the browser can all run it. The Convex agents only load the vendor book and call these functions:

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
| `crs`, `ofacHit` | Always `{ status: "not_checked" }` and `false` until CRS is wired. `ofacHit: false` with a status other than `"ok"` means OFAC **did not run**. |

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
| **CRS** KYB and OFAC (`CRS_USERNAME`, `CRS_PASSWORD`, `CRS_BASE_URL`) | `crs: { status: "not_checked" }`, `ofacHit: false` | In `runVendorVerifier`:<br>• `POST /users/login` for a Bearer token<br>• look up `vendor.crsBusinessId` (business credit, i.e. KYB)<br>• screen any new beneficiary against the OFAC watchlist<br>Any error or timeout must return `crs: { status: "unavailable" }`. The endpoints and test identities are in the CRS Postman collection. |
| **Moss** index (`MOSS_PROJECT_ID`, `MOSS_API_KEY`) | Wired; see the Moss section below | Done: both agents pass Moss hits to `matchVendor`, and matching falls back to memory when Moss isn't set up |
| **Claude** explanation (`ANTHROPIC_API_KEY`) | Template text from `explainRisk` | Rewrite the explanation from the flags, falling back to the template on any error. |

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
- **CRS status:** `"not_checked"` fires no rule today, so PAY doesn't wait for CRS. Once CRS is wired, an error or timeout returns `"unavailable"`, which escalates through R14.
- **R9 blocks on `forbidden_rail`, and no one can override it.** So its text check covers only R9's own list: gift cards, crypto, and a personal account. A Zelle or Venmo mention raises the display-only `bank_change` instead, and the Payer only ever pays the bank on file.
- **R11 and R15** read the `owner_impersonation` and `injection_attempt` flags. Their text checks ignore greetings ("Hi Priya"), negations and ordinary billing phrases.
- **`isAmountAnomalous`** (`riskFlags.ts`) is the same definition as R4.
- **Known-bad senders:** addresses that `cases.markSenderKnownBad` writes for R10 are never on file again, even when the sender is the vendor's own number.
- **Spoofing:** caller ID and an email's From can be faked, so "on file" isn't proof. The owner's registered phone also counts as on file. Bank changes always go through R2's callback, whoever sends them.
- **Lane summaries:** `advance` passes no `summarize` function for the P3 lanes. `riskFindings.explanation` is ready-made display text.
- **Public data:** case documents, including both findings, are returned by public queries. The explanation therefore never contains on-file phones, banks or amount ranges.
