import { headers } from "next/headers";
import { cache } from "react";
import { apiBaseUrl } from "./api-config";
import { auth } from "./auth";

/**
 * Calls the SpecThread API as the signed-in user (ADR-024). Server-only: use it from
 * server components, server actions, or route handlers, never from client components.
 * Exchanges the Better Auth session for a short-lived JWT and sends it as a bearer
 * token. String bodies are sent as JSON. Returns the raw Response so callers handle 400/403/404/409 themselves;
 * see docs/API.md. Throws when SPECTHREAD_API_URL is not configured or there is no session.
 * Within one server render every call shares a single token exchange.
 *
 * Every call times out after API_TIMEOUT_MS. A GET that fails with a network error, a timeout,
 * or 500/502/503/504 is retried once, because those are usually brief (a database connection
 * refused for a moment, a restarting API) and a refresh would succeed. Writes are never
 * retried, so nothing runs twice (ADR-046).
 */
export async function apiFetch(path: `/${string}`, init: RequestInit = {}, incomingHeaders?: Headers): Promise<Response> {
  const base = apiBaseUrl(process.env.SPECTHREAD_API_URL);
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error("apiFetch path must stay on the API origin.");
  const { token } = incomingHeaders ? await auth.api.getToken({ headers: incomingHeaders }) : await requestToken();
  const requestHeaders = new Headers(init.headers);
  requestHeaders.set("authorization", `Bearer ${token}`);
  // FormData bodies need fetch to set the multipart boundary, so only JSON strings get a type.
  if (typeof init.body === "string" && !requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json");
  }
  const send = () => fetch(url, { ...init, headers: requestHeaders, cache: "no-store", signal: withTimeout(init.signal) });
  if ((init.method ?? "GET").toUpperCase() !== "GET") return send();
  try {
    const response = await send();
    if (!RETRYABLE_STATUSES.has(response.status)) return response;
    logRetry(url, `status ${response.status}`);
    await response.body?.cancel();
  } catch (error) {
    if (init.signal?.aborted) throw error;
    logRetry(url, error instanceof Error ? error.name : "error");
  }
  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
  return send();
}

const API_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 300;
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

/** The caller's abort signal, if any, combined with this call's timeout. */
function withTimeout(signal: AbortSignal | null | undefined) {
  const timeout = AbortSignal.timeout(API_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Logs a retried read by its path shape only: IDs and the token never reach the log. */
function logRetry(url: URL, reason: string) {
  const path = url.pathname.replace(/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/gi, ":id");
  console.warn(`API GET ${path} failed (${reason}); retrying once.`);
}

/**
 * The current request's API token. A page that reads several API resources would otherwise
 * repeat the session lookup and token signing for each one. React scopes this cache to one
 * server render; server actions and route handlers outside a render are not memoized.
 */
const requestToken = cache(async () => {
  const requestHeaders = await headers();
  try {
    return await auth.api.getToken({ headers: requestHeaders });
  } catch {
    // The exchange reads the session from the database; a refused connection is usually brief.
    // A missing session fails the same way twice, so this never turns signed-out into signed-in.
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    return auth.api.getToken({ headers: requestHeaders });
  }
});
