// Live end-to-end check of the words-to-decision path, minus I/O:
//   scenario text -> real Claude Intake Parser -> reference verifier/risk -> real Policy Engine.
// Compares the extracted fields with scenarios.json and the decision with the answer key.
//
//   npm run scenarios                     deterministic only (no API calls)
//   npm run eval:intake                   all 30 scenarios against Claude (needs ANTHROPIC_API_KEY)
//   npm run eval:intake -- aws-lookalike  one scenario
import { extractPaymentRequest } from "../convex/lib/claude";
import { DEFAULT_REQUEST, SCENARIOS, runScenario, summaryLine, type Scenario } from "../scenarios/run";
import { matchVendor } from "../scenarios/world";
import type { PaymentRequest, PolicyResult } from "../shared/types";

const BIZ = { ownerName: "Priya Raman", company: "Lumen Labs" };
const live = !process.argv.includes("--offline");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const scenarios = only.length ? SCENARIOS.filter((s) => only.includes(s.id)) : SCENARIOS;

function fieldDiffs(expected: PaymentRequest, got: PaymentRequest): string[] {
  const diffs: string[] = [];
  const vendorOf = (r: PaymentRequest) => matchVendor(r.claimedVendorName)?.id ?? (r.claimedVendorName ? "unknown-vendor" : null);
  if (vendorOf(expected) !== vendorOf(got)) diffs.push(`vendor ${expected.claimedVendorName} ≠ ${got.claimedVendorName}`);
  if (expected.claimedSenderRole !== got.claimedSenderRole) diffs.push(`role ${expected.claimedSenderRole} ≠ ${got.claimedSenderRole}`);
  if (expected.amountCents !== got.amountCents) diffs.push(`amount ${expected.amountCents} ≠ ${got.amountCents}`);
  if ((expected.invoiceNumber ?? "") !== (got.invoiceNumber ?? "")) diffs.push(`invoice ${expected.invoiceNumber} ≠ ${got.invoiceNumber}`);
  if ((expected.newBankDetails?.account ?? null) !== (got.newBankDetails?.account ?? null)) {
    diffs.push(`account ${expected.newBankDetails?.account} ≠ ${got.newBankDetails?.account}`);
  }
  if (expected.requestedAction !== got.requestedAction) diffs.push(`action ${expected.requestedAction} ≠ ${got.requestedAction}`);
  if (expected.injectionAttempt !== got.injectionAttempt) diffs.push(`injection ${expected.injectionAttempt} ≠ ${got.injectionAttempt}`);
  return diffs;
}

async function evalOne(s: Scenario) {
  const expected = { ...DEFAULT_REQUEST, ...s.request };
  const started = Date.now();
  const { request, error } = live
    ? await extractPaymentRequest(s.channel, s.text, BIZ)
    : { request: expected, error: undefined };
  const ms = Date.now() - started;
  const r = runScenario(s, request);
  return { s, r, diffs: fieldDiffs(expected, request), error, ms };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function main() {
  const rows = await pool(scenarios, Number(process.env.EVAL_CONCURRENCY ?? 5), evalOne);
  let decisionMisses = 0;
  for (const { s, r, diffs, error, ms } of rows) {
    const ok = r.decision === s.expectedDecision && s.expectedRules.every((rule) => r.firedRules.includes(rule));
    if (!ok) decisionMisses++;
    const mark = ok ? "✓" : "✗";
    console.log(
      `${mark} ${s.id.padEnd(36)} ${r.decision.padEnd(9)} ${r.firedRules.join(",").padEnd(18)} ${live ? `${ms}ms` : ""}`,
    );
    if (!ok) console.log(`    expected ${s.expectedDecision} ${s.expectedRules.join(",")}`);
    if (diffs.length) console.log(`    fields: ${diffs.join("; ")}`);
    if (error) console.log(`    intake error: ${error}`);
  }

  const results: { s: Scenario; r: PolicyResult }[] = rows.map(({ s, r }) => ({ s, r }));
  console.log(`\n${summaryLine(results)}${live ? " (live Claude intake)" : ""}`);
  if (live) {
    const times = rows.map((x) => x.ms).sort((a, b) => a - b);
    console.log(`intake latency: median ${times[Math.floor(times.length / 2)]}ms, max ${times.at(-1)}ms`);
  }
  process.exitCode = decisionMisses ? 1 : 0;
}

void main();
