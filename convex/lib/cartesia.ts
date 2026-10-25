// Cartesia Agents API helpers (owner: P2). Docs: https://docs.cartesia.ai/line/integrations/telephony/outbound-dialing
const API_BASE = "https://api.cartesia.ai";
const API_VERSION = "2026-08-14";
/** Placing a call returns as soon as it is queued; a request that takes longer than this is treated as a failed dial. */
export const DIAL_TIMEOUT_MS = 20_000;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing Convex env var ${name}`);
  return value;
}

/**
 * Places one outbound call from the callback number with the callback agent.
 * `toNumber` must come from the database (vendors.phoneOnFile), never from a request or a model.
 */
export async function placeOutboundCall(args: {
  toNumber: string;
  dynamicVariables: Record<string, string>;
  ringingTimeoutSeconds: number;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIAL_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/agents/calls`, {
      method: "POST",
      headers: {
        "X-API-Key": env("CARTESIA_API_KEY"),
        "Cartesia-Version": API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: env("CARTESIA_CALLBACK_AGENT_ID"),
        from_number_id: env("CARTESIA_CALLBACK_NUMBER_ID"),
        ringing_timeout_seconds: args.ringingTimeoutSeconds,
        outbound_calls: [{ to_number: args.toNumber, dynamic_variables: args.dynamicVariables }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(`Cartesia outbound call failed: ${controller.signal.aborted ? `no response in ${DIAL_TIMEOUT_MS / 1000} s` : String(err).slice(0, 300)}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Cartesia outbound call failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as { calls?: { agent_call_id?: string; error?: string }[] };
  const call = body.calls?.[0];
  if (!call?.agent_call_id) throw new Error(`Cartesia outbound call rejected: ${call?.error ?? text.slice(0, 300)}`);
  return call.agent_call_id;
}

export type CallRecord = { status: string; endReason: string | null; summary: string | null; transcript: string | null };

/** Fetches a finished call's transcript and summary. Speaker labels: our agent is "Countersign". */
export async function getCall(callId: string, otherParty: string): Promise<CallRecord> {
  const res = await fetch(`${API_BASE}/agents/calls/${encodeURIComponent(callId)}`, {
    headers: { "X-API-Key": env("CARTESIA_API_KEY"), "Cartesia-Version": API_VERSION },
  });
  if (!res.ok) throw new Error(`Cartesia get call failed: HTTP ${res.status}`);
  const body = (await res.json()) as {
    status?: string;
    end_reason?: string;
    summary?: string;
    transcript?: { role?: string; text?: string }[];
  };
  const lines = (body.transcript ?? [])
    .filter((t) => t.text?.trim())
    .map((t) => `${t.role === "assistant" ? "Countersign" : otherParty}: ${t.text!.trim()}`);
  return {
    status: body.status ?? "unknown",
    endReason: body.end_reason ?? null,
    summary: body.summary ?? null,
    transcript: lines.length ? lines.join("\n") : null,
  };
}

/**
 * Webhook tools send our shared secret in the X-Countersign-Secret header (configured as a
 * "secret" header on each tool). Reject anything without it.
 */
export function toolSecretValid(request: Request): boolean {
  const expected = process.env.CARTESIA_TOOL_SECRET;
  const given = request.headers.get("X-Countersign-Secret");
  if (!expected || !given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/** "$4,800.00" style amount for the voice agent to read out. */
export function spokenAmount(cents: number | null | undefined): string {
  if (cents == null) return "an unspecified amount";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
