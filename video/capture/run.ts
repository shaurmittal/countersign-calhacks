// The product shots, each driving the real deployed app (SITE_URL, default the Vercel site).
//   npm run capture -- <shot> [<shot>...]     e.g. npm run capture -- bank-hijack breakit-run
// Shots that need a live phone call or invoices still open are marked; see video/README.md.
import { execFile } from "node:child_process";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { record, type Shot } from "./record";

const REPO = join(__dirname, "..", "..");
const visitor = (tag: string) => ({ "countersign-sender": `video-${tag}-${Date.now().toString(36)}` });

/** Fires a real case on the deployment, the same way /try's buttons do, while the War Room is filming. */
function convexRun(fn: string, args: object): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile("npx", ["convex", "run", fn, JSON.stringify(args)], { cwd: REPO }, (err) => (err ? reject(err) : resolve())),
  );
}

/** Waits until `text` is on the page, up to `ms`. */
async function until(page: Page, text: string | RegExp, ms = 60_000) {
  await page.getByText(text).first().waitFor({ state: "visible", timeout: ms });
}

/** Eased scroll to an element. Plain JS string: tsx would inject helpers the page doesn't have. */
async function smoothScrollTo(page: Page, selector: string, ms = 1400, offset = 40) {
  await page.evaluate(`(async () => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return;
    const start = window.scrollY, end = start + el.getBoundingClientRect().top - ${offset}, t0 = performance.now();
    await new Promise((done) => {
      const step = (now) => {
        const x = Math.min(1, (now - t0) / ${ms});
        const e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
        window.scrollTo(0, start + (end - start) * e);
        if (x < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
  })()`);
}

export const SHOTS: Record<string, Shot> = {
  // The bank refuses four direct transfer attempts (needs one real countersigned transfer to exist).
  "bank-hijack": {
    name: "bank-hijack",
    path: "/bank",
    act: async (page) => {
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: /Send the four requests/i }).click();
      await page.waitForTimeout(7000);
    },
  },
  // The bank's ledger: a real bill paid through the pipeline, countersigned, next to refused attempts.
  "bank-ledger": {
    name: "bank-ledger",
    path: "/bank",
    act: async (page) => {
      await page.waitForTimeout(600);
      await smoothScrollTo(page, "section[aria-label=\"Transfer ledger\"], .bk-ledger", 1600, 120);
      await page.waitForTimeout(4500);
    },
  },
  // The answer key, run in the browser through the real decide().
  "breakit-run": {
    name: "breakit-run",
    path: "/demo#break-it",
    settleMs: 4000,
    act: async (page) => {
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: /Run all \d+/ }).click();
      await page.waitForTimeout(6500);
    },
  },
  // A forged email refused on /try (simulated headers, real parser and pipeline).
  "try-forged-email": {
    name: "try-forged-email",
    path: "/try",
    storage: visitor("forged"),
    act: async (page) => {
      await page.waitForTimeout(1000);
      await smoothScrollTo(page, ".tr-mail-intro");
      await page.waitForTimeout(600);
      await page.locator(".tr-mail-intro .tr-mails button").first().click();
      await until(page, /draft reply/i, 60_000);
      await page.waitForTimeout(6000);
    },
  },
  // The War Room lighting up live on a real case: a forged vendor email, start to BLOCK.
  "warroom-email-live": {
    name: "warroom-email-live",
    path: "/",
    settleMs: 3000,
    act: async (page) => {
      await page.waitForTimeout(1500);
      await convexRun("channels/email:simulateAttack", { attack: "forged-vendor", senderId: `video-wr-${Date.now().toString(36)}` });
      await until(page, /draft reply/i, 60_000);
      await page.waitForTimeout(5000);
    },
  },
  // The War Room at rest: scoreboard and the audit chain scrolling.
  "warroom-idle": {
    name: "warroom-idle",
    path: "/",
    settleMs: 3500,
    act: async (page) => page.waitForTimeout(9000),
  },
  // The /demo replay of case …8gx7rm, played from the start (stand-in for the hero shots until the
  // live War Room call is filmed). Footage time = film time.
  "film-replay": {
    name: "film-replay",
    path: "/demo?t=0.05",
    settleMs: 3000,
    act: async (page) => {
      await smoothScrollTo(page, "section#film .lp-film", 10, 150);
      await page.waitForTimeout(300);
      await page.locator(".lp-soundhint").click().catch(() => {}); // dismisses the hint; headless has no speakers
      await page.waitForTimeout(500);
      await page.locator(".lp-playbtn").click();
      await page.waitForTimeout(101_500);
    },
  },
  // NEEDS an open NW-889 (re-seed first): a real bill, paid automatically, then the countersigned transfer.
  "try-pay": {
    name: "try-pay",
    path: "/try",
    storage: visitor("pay"),
    act: async (page) => {
      await page.waitForTimeout(800);
      const box = page.locator("#tr-input");
      await box.click();
      await box.pressSequentially("Pay Northwind #NW-889", { delay: 55 });
      await page.waitForTimeout(400);
      await page.keyboard.press("Enter");
      await until(page, /Paid to the account on file|Nothing to pay|On hold|Refused/i, 90_000);
      await page.waitForTimeout(4000);
    },
  },
  // NEEDS a live callback (the proper demo call): the War Room through a real phone scam, start to BLOCK.
  // Start this, then place the call; it stops 8 s after the BLOCK.
  "warroom-call-live": {
    name: "warroom-call-live",
    path: "/",
    settleMs: 3000,
    act: async (page) => {
      await until(page, /^BLOCK$/, 6 * 60_000);
      await page.waitForTimeout(8000);
    },
  },
};

async function main() {
  const names = process.argv.slice(2);
  if (names.length === 0) throw new Error(`Name a shot: ${Object.keys(SHOTS).join(", ")}`);
  for (const name of names) {
    const shot = SHOTS[name];
    if (!shot) throw new Error(`Unknown shot ${name}`);
    await record(shot);
  }
}

void main();
