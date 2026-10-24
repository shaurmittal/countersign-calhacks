// Rehearsal: every scenario in scenarios.json through the DEPLOYED pipeline. Real Claude intake,
// real P3 verifier/risk, real Policy Engine, real P4 approvals and Payer. Only the vendor's answer
// on the callback and the owner's authenticator code are simulated.
//
// It reseeds (WIPES) the deployment before each scenario, so it refuses anything but a dev deployment.
// One-time setup on your own dev deployment:
//   npx convex env set CALLBACK_DIAL off                 # callbacks wait for this script instead of dialing
//   npm run enroll:owner -- "Rehearsal"                  # throwaway secret, dev deployment only
//   npx convex env set OWNER_TOTP_SECRET <secret>
//   echo "REHEARSAL_TOTP_SECRET=<secret>" >> .env.local
// Run:
//   npm run rehearse                       all scenarios
//   npm run rehearse -- aws-lookalike      one scenario
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { Secret, TOTP } from "otpauth";
import { OWNER_CODE } from "../shared/config";
import { SCENARIOS, type Scenario } from "../scenarios/run";
import { OWNER_PHONE } from "../scenarios/world";

const run = promisify(execFile);
const CASE_TIMEOUT_MS = 120_000;
const POLL_MS = 1_500;

function envLocal(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .flatMap((line) => {
          const m = line.match(/^([A-Z0-9_]+)=([^#\s]*)/);
          return m ? [[m[1], m[2]]] : [];
        }),
    );
  } catch {
    return {};
  }
}

async function convex<T = unknown>(fn: string, args: object = {}): Promise<T> {
  const { stdout } = await run("npx", ["convex", "run", fn, JSON.stringify(args)], { maxBuffer: 10_000_000 });
  const text = stdout.trim();
  return (text ? JSON.parse(text) : null) as T;
}

async function envGet(name: string): Promise<string | null> {
  try {
    const { stdout } = await run("npx", ["convex", "env", "get", name]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type CaseRow = {
  _id: string;
  status: string;
  decision?: string;
  replyText?: string;
  policyResult?: { decision: string; firedRules: string[]; reasons: string[] };
};
type CallbackRow = { _id: string; attempt: number; outcome: string | null };

function ownerCode(secret: string): string {
  return new TOTP({ secret: Secret.fromBase32(secret), digits: OWNER_CODE.digits, period: OWNER_CODE.periodSeconds }).generate();
}

/** Drives one case to rest, answering callbacks and approvals the way the scenario says. */
async function drive(caseId: string, s: Partial<Scenario>, totpSecret: string) {
  const deadline = Date.now() + CASE_TIMEOUT_MS;
  const answered = new Set<string>();
  let approved = false;
  for (;;) {
    const c = await convex<CaseRow>("cases:get", { caseId });
    if (c.status === "CLOSED") return { c, note: "" };

    if (c.status === "CALLBACK_PENDING") {
      const callbacks = await convex<CallbackRow[]>("callbacks:forCase", { caseId });
      const pending = callbacks.find((cb) => cb.outcome == null && !answered.has(cb._id));
      if (pending && !s.callbackOutcome) return { c, note: "callback pending (scenario gives no answer)" };
      if (pending && s.callbackOutcome) {
        answered.add(pending._id);
        await convex("agents/callbackVerifier:recordOutcome", { callbackId: pending._id, outcome: s.callbackOutcome });
      }
    }

    if (c.status === "AWAITING_OWNER") {
      if (!s.approval) return { c, note: "" };
      if (!approved) {
        // The pipeline asks the concierge asynchronously; the approvals row may not exist yet.
        const result = await convex<{ ok: boolean; error?: string }>("agents/ownerConcierge:submitCode", {
          caseId,
          code: ownerCode(totpSecret),
          action: "approve",
        }).catch((e) => ({ ok: false, error: String(e) }));
        if (result.ok) approved = true;
      }
    }

    if (Date.now() > deadline) return { c, note: `timed out in ${c.status}` };
    await sleep(POLL_MS);
  }
}

async function main() {
  const local = envLocal();
  const deployment = process.env.CONVEX_DEPLOYMENT ?? local.CONVEX_DEPLOYMENT ?? "";
  if (!deployment.startsWith("dev:")) {
    console.error(`Refusing to run: this reseeds (wipes) the deployment, and "${deployment || "none"}" is not a dev deployment.`);
    process.exit(1);
  }
  const totpSecret = process.env.REHEARSAL_TOTP_SECRET ?? local.REHEARSAL_TOTP_SECRET;
  const [dial, ownerSecret] = await Promise.all([envGet("CALLBACK_DIAL"), envGet("OWNER_TOTP_SECRET")]);
  const problems = [
    dial !== "off" && "CALLBACK_DIAL is not 'off' on the deployment (callbacks would really dial)",
    !ownerSecret && "OWNER_TOTP_SECRET is not set on the deployment",
    !totpSecret && "REHEARSAL_TOTP_SECRET is not in .env.local",
    totpSecret && ownerSecret && totpSecret !== ownerSecret && "REHEARSAL_TOTP_SECRET does not match OWNER_TOTP_SECRET",
  ].filter(Boolean);
  if (problems.length) {
    console.error(`Setup needed (see the top of scripts/live-scenarios.ts):\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }

  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const scenarios = only.length ? SCENARIOS.filter((s) => only.includes(s.id)) : SCENARIOS;
  console.log(`Rehearsing ${scenarios.length} scenarios on ${deployment}\n`);

  let pass = 0;
  let falsePay = 0;
  const skipped: string[] = [];
  for (const s of scenarios) {
    if (s.world?.ofacHit || s.world?.crs) {
      skipped.push(`${s.id} (needs an OFAC/CRS override; covered by npm run scenarios)`);
      continue;
    }
    const started = Date.now();
    await convex("seed:run");
    if (s.world?.paidInvoices?.includes("NW-889")) {
      // Make the invoice paid the real way: pay it through the pipeline first.
      const { caseId } = await convex<{ caseId: string }>("cases:open", {
        channel: "web",
        fromAddress: OWNER_PHONE,
        rawContent: "Pay Northwind #NW-889",
      });
      await drive(caseId, {}, totpSecret!);
    }

    const { caseId } = await convex<{ caseId: string }>("cases:open", { channel: s.channel, fromAddress: s.from, rawContent: s.text });
    const { c, note } = await drive(caseId, s, totpSecret!);
    const decision = c.decision ?? c.policyResult?.decision ?? "?";
    const fired = c.policyResult?.firedRules ?? [];
    const ok = decision === s.expectedDecision && s.expectedRules.every((r) => fired.includes(r));
    if (ok) pass++;
    if (decision === "PAY" && s.expectedDecision !== "PAY") falsePay++;

    const secs = ((Date.now() - started) / 1000).toFixed(0);
    console.log(`${ok ? "✓" : "✗"} ${s.id.padEnd(36)} ${decision.padEnd(9)} ${fired.join(",").padEnd(22)} ${secs}s ${note}`);
    if (!ok) {
      console.log(`    expected ${s.expectedDecision} ${s.expectedRules.join(",")}`);
      for (const r of c.policyResult?.reasons ?? []) console.log(`    · ${r}`);
    }
    if (c.replyText) console.log(`    reply: ${c.replyText}`);
  }

  const ran = scenarios.length - skipped.length;
  console.log(`\n${pass}/${ran} live scenarios match the answer key · ${falsePay} false PAY`);
  if (skipped.length) console.log(`skipped: ${skipped.join("; ")}`);
  process.exitCode = pass === ran && falsePay === 0 ? 0 : 1;
}

void main();
