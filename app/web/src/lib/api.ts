import { headers } from "next/headers";
import { apiBaseUrl } from "./api-config";
import { auth } from "./auth";

/**
 * Calls the SpecThread API as the signed-in user (ADR-024). Server-only: use it from
 * server components, server actions, or route handlers, never from client components.
 * Exchanges the Better Auth session for a short-lived JWT and sends it as a bearer
 * token. Returns the raw Response so callers handle 400/403/404/409 themselves;
 * see docs/API.md. Throws when SPECTHREAD_API_URL is not configured or there is no session.
 */
export async function apiFetch(path: `/${string}`, init: RequestInit = {}, incomingHeaders?: Headers): Promise<Response> {
  const base = apiBaseUrl(process.env.SPECTHREAD_API_URL);
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error("apiFetch path must stay on the API origin.");
  const { token } = await auth.api.getToken({ headers: incomingHeaders ?? await headers() });
  const requestHeaders = new Headers(init.headers);
  requestHeaders.set("authorization", `Bearer ${token}`);
  if (init.body !== undefined && !requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json");
  }
  return fetch(url, { ...init, headers: requestHeaders, cache: "no-store" });
}
