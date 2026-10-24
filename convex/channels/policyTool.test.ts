// @vitest-environment edge-runtime
// The lookup_policy voice tool (convex/channels/voice.ts) against an in-memory Convex backend: the tool
// secret, the empty-question nudge, and a plain-text policy answer. No Moss credentials here, so
// agents/moss:lookupPolicy answers from keywords at once.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";

const SECRET = "tool-secret-for-tests-0123456789";

function ask(body: unknown, secret: string | null = SECRET) {
  const t = convexTest(schema, modules);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["X-Countersign-Secret"] = secret;
  return t.fetch("/cartesia/tools/policy", { method: "POST", headers, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.stubEnv("CARTESIA_TOOL_SECRET", SECRET);
  vi.stubEnv("MOSS_PROJECT_ID", "");
  vi.stubEnv("MOSS_API_KEY", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("lookup_policy", () => {
  it("refuses calls without the right tool secret", async () => {
    expect((await ask({ question: "why do you call the vendor?" }, null)).status).toBe(401);
    expect((await ask({ question: "why do you call the vendor?" }, "x".repeat(SECRET.length))).status).toBe(401);
  });

  it("answers a policy question in plain text, with no numbers in it", async () => {
    const res = await ask({ question: "caller asks why Countersign has to call the vendor back", conversation_id: "c1" });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/^Countersign policy: /);
    expect(body).toContain("already on file");
    expect(body).not.toMatch(/\d/);
  });

  it("nudges the agent instead of failing when the question is empty", async () => {
    const res = await ask({ question: "   " });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("call lookup_policy");
  });
});
