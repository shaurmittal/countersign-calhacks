// Increase sandbox REST client (owner: P4). Plain fetch, no SDK.
// API reference: https://increase.com/documentation/api
const SANDBOX_BASE_URL = "https://sandbox.increase.com";
const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 500;
const MAX_ERROR_DETAIL_CHARS = 200;

export class IncreaseError extends Error {
  constructor(
    message: string,
    /** True for network errors, timeouts, 429 and 5xx: worth one retry. */
    readonly transient: boolean,
  ) {
    super(message);
  }
}

export function increaseConfigured(): boolean {
  return !!process.env.INCREASE_API_KEY;
}

/**
 * One Increase API call. POSTs carry an Idempotency-Key, so a retry after a timeout returns the
 * original object instead of creating a second one.
 */
export async function increaseRequest<T>(
  method: "GET" | "POST",
  path: string,
  options: { body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const apiKey = process.env.INCREASE_API_KEY;
  if (!apiKey) throw new IncreaseError("INCREASE_API_KEY is not set", false);

  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${SANDBOX_BASE_URL}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new IncreaseError(`Increase ${method} ${path}: network error or timeout (${String(err)})`, true);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  if (!response.ok) {
    const transient = response.status === 429 || response.status >= 500;
    throw new IncreaseError(`Increase ${method} ${path} returned ${response.status}: ${errorDetail(text)}`, transient);
  }
  return JSON.parse(text) as T;
}

/** Spec §8.3: retry once on a transient failure, never on a 4xx. */
export async function withOneRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (!(err instanceof IncreaseError) || !err.transient) throw err;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return call();
  }
}

/** Increase errors are JSON with `title` and `detail`. Only those go in logs, never the whole body. */
function errorDetail(body: string): string {
  try {
    const { title = "", detail = "" } = JSON.parse(body) as { title?: string; detail?: string };
    const text = detail.startsWith(title.replace(/\.$/, "")) ? detail : [title, detail].filter(Boolean).join(" ");
    return text.slice(0, MAX_ERROR_DETAIL_CHARS) || "no detail";
  } catch {
    return "non-JSON error body";
  }
}
