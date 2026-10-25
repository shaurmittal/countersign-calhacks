import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DIAL_TIMEOUT_MS, placeOutboundCall } from "./cartesia";

const ARGS = { toNumber: "+15555550101", dynamicVariables: {}, ringingTimeoutSeconds: 45 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("CARTESIA_API_KEY", "test-key");
  vi.stubEnv("CARTESIA_CALLBACK_AGENT_ID", "agent_test");
  vi.stubEnv("CARTESIA_CALLBACK_NUMBER_ID", "ap_test");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("placeOutboundCall", () => {
  it("gives up on a dial request that never answers, so the callback can end as no_answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
          }),
      ),
    );
    const dial = placeOutboundCall(ARGS);
    const outcome = dial.then(
      () => "resolved",
      (err: Error) => err.message,
    );
    await vi.advanceTimersByTimeAsync(DIAL_TIMEOUT_MS + 1);
    expect(await outcome).toBe(`Cartesia outbound call failed: no response in ${DIAL_TIMEOUT_MS / 1000} s`);
  });

  it("returns the call id when Cartesia answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ calls: [{ agent_call_id: "call_123" }] })));
    expect(await placeOutboundCall(ARGS)).toBe("call_123");
  });
});
