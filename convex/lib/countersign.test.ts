// Import guard: signRelease may only be called from the Payer. If anything else imports it (an agent, a
// webhook, a voice tool), this test fails, so "only the PAY branch can sign a transfer" stays true.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const ALLOWED = new Set(["convex/agents/payer.ts", "convex/lib/countersign.ts"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "_generated", "demo", ".convex"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(path);
  }
  return out;
}

describe("signRelease import guard", () => {
  it("only the Payer imports or calls signRelease", () => {
    const offenders = sourceFiles(ROOT)
      .map((f) => relative(ROOT, f))
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => /\bsignRelease\b|lib\/countersign["']/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the Payer is the one that does", () => {
    expect(readFileSync(join(ROOT, "convex/agents/payer.ts"), "utf8")).toMatch(/import \{ signRelease \} from "\.\.\/lib\/countersign"/);
  });

  it("only countersign.ts reads the private key", () => {
    const readers = sourceFiles(ROOT)
      .map((f) => relative(ROOT, f))
      .filter((f) => !f.startsWith("scripts/"))
      .filter((f) => /env(\.|\[["'])COUNTERSIGN_SIGNING_KEY/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(readers).toEqual(["convex/lib/countersign.ts"]);
  });
});
