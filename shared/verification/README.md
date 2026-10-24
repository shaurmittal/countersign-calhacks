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
| **Moss** index (`MOSS_PROJECT_ID`, `MOSS_API_KEY`) | `matchVendor` runs in memory over the vendors table | `@moss-js/moss` needs native binaries, so it runs only in a separate `"use node"` action, with `node.externalPackages` set in `convex.json`. Pass its hits (vendor id plus a 0..1 score) to `matchVendor` as `searchHits`. The in-memory scores stay as the fallback. |
| **Claude** explanation (`ANTHROPIC_API_KEY`) | Template text from `explainRisk` | Rewrite the explanation from the flags, falling back to the template on any error. |

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
