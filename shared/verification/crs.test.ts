import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSeedBook } from "../seedWorld";
import {
  CRS_REQUEST_TIMEOUT_MS,
  CRS_SANDBOX_API,
  FRAUD_RISK_THRESHOLD,
  LOGIN_PAUSE_AFTER_REJECT_MS,
  TOKEN_REUSE_MS,
  createCrsClient,
  crsApiBase,
  crsConfig,
  crsFromFraudFinder,
  crsUnavailable,
  emailToScreen,
  parseFraudFinder,
  type CrsFetch,
  type CrsResult,
} from "./crs";

// What the CRS sandbox returned on 2026-10-24 for invoices@northwind-cloud-billing.example (query_id
// dropped). The seed vendor's billing@pixelandpine.example got exactly the same scores.
const SANDBOX_BODY = {
  eam: { date_first_seen: "2026-10-24", longevity: 0, velocity: 0, popularity: 0 },
  dam: { date_first_seen: "2026-10-24", longevity: 0, velocity: 0, popularity: 0 },
  risk: { score: 100, tumbling_risk: 0, domain: { domain_risk_score: 10 } },
  email_validation: {
    address: "invoices@northwind-cloud-billing.example",
    status: "invalid",
    status_code: 200,
    role_account: true,
  },
};

const CONFIG = { api: CRS_SANDBOX_API, username: "crs-user", password: "crs-secret-pw" };
const TOKEN = "jwt-header.jwt-payload.jwt-signature";

describe("crsApiBase and crsConfig", () => {
  it.each<[string | undefined, string | null]>([
    [undefined, CRS_SANDBOX_API],
    ["https://api-sandbox.stitchcredit.com:443/api", CRS_SANDBOX_API],
    ["https://api-sandbox.stitchcredit.com/api/", CRS_SANDBOX_API],
    ["https://api-sandbox.stitchcredit.com", CRS_SANDBOX_API],
    ["https://api.stitchcredit.com/api", null], // not the sandbox
    ["http://api-sandbox.stitchcredit.com/api", null],
    ["not a url", null],
  ])("%s -> %s", (baseUrl, expected) => {
    expect(crsApiBase(baseUrl)).toBe(expected);
  });

  it("needs a username and a password, and only ever points at the sandbox", () => {
    expect(crsConfig({ CRS_USERNAME: " crs-user ", CRS_PASSWORD: "crs-secret-pw" })).toEqual(CONFIG);
    expect(crsConfig({ CRS_USERNAME: "crs-user" })).toBeNull();
    expect(crsConfig({ CRS_USERNAME: "  ", CRS_PASSWORD: "crs-secret-pw" })).toBeNull();
    expect(crsConfig({ CRS_USERNAME: "crs-user", CRS_PASSWORD: "crs-secret-pw", CRS_BASE_URL: "https://api.stitchcredit.com/api" })).toBeNull();
  });
});

describe("emailToScreen", () => {
  const book = buildSeedBook();

  it.each<[string, string | null]>([
    ["invoices@northwind-cloud-billing.example", "invoices@northwind-cloud-billing.example"],
    ["Volga Trading <Accounts@Volga-Trading.example>", "accounts@volga-trading.example"],
    ["billing@pixelandpine.example", null], // on file
    ["someone.new@pixelandpine.example", null], // a mailbox on the vendor's own domain
    ["priya@lumenlabs.example", null], // the owner
    ["+15555550101", null],
    ["agent1qexampleagentaddress", null],
  ])("%s -> %s", (from, expected) => {
    expect(emailToScreen(from, book)).toBe(expected);
  });
});

describe("parseFraudFinder", () => {
  it("reads the scores the War Room shows, and leaves the address out", () => {
    expect(parseFraudFinder(SANDBOX_BODY)).toEqual({
      score: 100,
      domainRiskScore: 10,
      emailStatus: "invalid",
      roleAccount: true,
      emailFirstSeen: "2026-10-24",
      domainFirstSeen: "2026-10-24",
    });
  });

  it("accepts a numeric string and clamps the score to 0..100", () => {
    expect(parseFraudFinder({ risk: { score: "250" } })).toEqual({
      score: 100,
      domainRiskScore: null,
      emailStatus: null,
      roleAccount: null,
      emailFirstSeen: null,
      domainFirstSeen: null,
    });
    expect(parseFraudFinder({ risk: { score: -3 } })?.score).toBe(0);
  });

  it.each([{}, { risk: {} }, { risk: { score: "high" } }, { risk: { score: null } }, null, "text", []])(
    "is null without a numeric risk.score: %j",
    (body) => {
      expect(parseFraudFinder(body)).toBeNull();
    },
  );
});

describe("crsFromFraudFinder", () => {
  const summary = parseFraudFinder(SANDBOX_BODY)!;

  it("a high score means CRS could not vouch for the sender, so R14 escalates", () => {
    const crs = crsFromFraudFinder(summary);
    expect(crs).toMatchObject({ status: "ok", businessVerified: false, raw: { product: "atdata_fraud_finder", score: 100 } });
    expect(JSON.stringify(crs)).not.toContain("@");
    expect(crsFromFraudFinder({ ...summary, score: FRAUD_RISK_THRESHOLD }).businessVerified).toBe(false);
  });

  it("a low score never claims the business is verified", () => {
    const crs = crsFromFraudFinder({ ...summary, score: FRAUD_RISK_THRESHOLD - 1 });
    expect(crs.status).toBe("ok");
    expect("businessVerified" in crs).toBe(false);
  });
});

/** A fake CRS sandbox: login and Fraud Finder replies as [status, body], and every call it received. */
function fakeCrs(replies: { login?: () => [number, unknown]; screen?: () => [number, unknown] } = {}) {
  const calls: { path: string; body: unknown; auth: string | undefined }[] = [];
  const fetchFn: CrsFetch = async (url, init) => {
    const path = url.slice(CRS_SANDBOX_API.length);
    calls.push({ path, body: JSON.parse(init.body), auth: init.headers.Authorization });
    const reply = path === "/users/login" ? replies.login : replies.screen;
    const [status, body] = reply?.() ?? [200, path === "/users/login" ? { token: TOKEN, expires: 3600 } : SANDBOX_BODY];
    return { status, text: async () => JSON.stringify(body) };
  };
  return { calls, fetchFn };
}

describe("createCrsClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs in once, sends only the email with the token, and reuses the token", async () => {
    const crs = fakeCrs();
    const client = createCrsClient(CONFIG, crs.fetchFn);
    const first = await client.screenEmail("invoices@northwind-cloud-billing.example");
    await client.screenEmail("accounts@volga-trading.example");
    expect(first).toMatchObject({ status: "ok", businessVerified: false });
    expect(crs.calls).toEqual([
      { path: "/users/login", body: { username: "crs-user", password: "crs-secret-pw" }, auth: undefined },
      { path: "/fraud-finder/fraud-finder", body: { email: "invoices@northwind-cloud-billing.example" }, auth: `Bearer ${TOKEN}` },
      { path: "/fraud-finder/fraud-finder", body: { email: "accounts@volga-trading.example" }, auth: `Bearer ${TOKEN}` },
    ]);
  });

  it("logs in again once the token is 45 minutes old", async () => {
    let clock = 0;
    const crs = fakeCrs();
    const client = createCrsClient(CONFIG, crs.fetchFn, () => clock);
    await client.screenEmail("a@stranger.example");
    clock = TOKEN_REUSE_MS;
    await client.screenEmail("a@stranger.example");
    expect(crs.calls.filter((c) => c.path === "/users/login")).toHaveLength(2);
  });

  it("after a rejected login, waits 10 minutes instead of retrying (failed logins lock the account)", async () => {
    let clock = 0;
    const crs = fakeCrs({ login: () => [401, { codes: ["CRS110"], messages: ["Bad credentials"] }] });
    const client = createCrsClient(CONFIG, crs.fetchFn, () => clock);
    expect(await client.screenEmail("a@stranger.example")).toEqual(crsUnavailable("login HTTP 401 CRS110"));
    clock = LOGIN_PAUSE_AFTER_REJECT_MS - 1;
    expect(await client.screenEmail("a@stranger.example")).toEqual(crsUnavailable("login paused after a failure"));
    expect(crs.calls).toHaveLength(1);
    clock = LOGIN_PAUSE_AFTER_REJECT_MS;
    await client.screenEmail("a@stranger.example");
    expect(crs.calls).toHaveLength(2);
  });

  it("a 401 on the check is unavailable and drops the token, so the next check logs in again", async () => {
    const crs = fakeCrs({ screen: () => [401, { codes: ["CRS111"], messages: ["Access Denied"] }] });
    const client = createCrsClient(CONFIG, crs.fetchFn);
    expect(await client.screenEmail("a@stranger.example")).toEqual(crsUnavailable("HTTP 401 CRS111"));
    await client.screenEmail("a@stranger.example");
    expect(crs.calls.map((c) => c.path)).toEqual(["/users/login", "/fraud-finder/fraud-finder", "/users/login", "/fraud-finder/fraud-finder"]);
  });

  it.each<[string, [number, unknown], CrsResult]>([
    ["a vendor error", [400, { codes: ["CRS777"], messages: ["AtData Service Error"] }], crsUnavailable("HTTP 400 CRS777")],
    ["a server error", [503, null], crsUnavailable("HTTP 503")],
    ["a body without a score", [200, { risk: {} }], crsUnavailable("unreadable response")],
    ["a body that isn't an object", [200, "<html>"], crsUnavailable("unreadable response")],
  ])("%s is unavailable, never ok", async (_label, reply, expected) => {
    const client = createCrsClient(CONFIG, fakeCrs({ screen: () => reply }).fetchFn);
    expect(await client.screenEmail("a@stranger.example")).toEqual(expected);
  });

  it("a check that hangs past the request timeout is unavailable", async () => {
    vi.useFakeTimers();
    const hangs: CrsFetch = (url, init) =>
      url.endsWith("/users/login")
        ? Promise.resolve({ status: 200, text: async () => JSON.stringify({ token: TOKEN }) })
        : new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    const result = createCrsClient(CONFIG, hangs).screenEmail("a@stranger.example");
    await vi.advanceTimersByTimeAsync(CRS_REQUEST_TIMEOUT_MS);
    await expect(result).resolves.toEqual(crsUnavailable("timeout"));
  });

  it("a network error is unavailable, and the login waits before trying again", async () => {
    const down: CrsFetch = async () => {
      throw new TypeError("fetch failed");
    };
    const client = createCrsClient(CONFIG, down);
    expect(await client.screenEmail("a@stranger.example")).toEqual(crsUnavailable("login network error"));
    expect(await client.screenEmail("a@stranger.example")).toEqual(crsUnavailable("login paused after a failure"));
  });

  it("never puts the username, password or token in a result", async () => {
    const results: CrsResult[] = [];
    for (const replies of [
      {},
      { login: (): [number, unknown] => [401, { codes: ["CRS113"] }] },
      { screen: (): [number, unknown] => [500, { codes: ["CRS777"], details: ["vendor said no"] }] },
    ]) {
      results.push(await createCrsClient(CONFIG, fakeCrs(replies).fetchFn).screenEmail("a@stranger.example"));
    }
    const text = JSON.stringify(results);
    for (const secret of [CONFIG.username, CONFIG.password, TOKEN]) expect(text).not.toContain(secret);
  });
});
