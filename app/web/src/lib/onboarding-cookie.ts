import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Remembers that a user finished first-team setup, so the page gate does not ask the API on
 * every navigation (ADR-042). Finishing setup is permanent: the API only ever adds that record,
 * and it still refuses project creation before setup. A forged or stale cookie can therefore
 * only skip the redirect to /onboarding, never grant access.
 */
export const ONBOARDED_COOKIE = "specthread.onboarded";

/** About a month; the value is bound to one user, so it never applies to another account. */
export const ONBOARDED_MAX_AGE = 30 * 24 * 60 * 60;

function signature(userId: string, secret: string) {
  return createHmac("sha256", secret).update(`onboarded:${userId}`).digest("base64url");
}

/** The cookie value for a user who has finished setup: their ID and an HMAC of it. */
export function onboardedCookieValue(userId: string, secret: string) {
  return `${userId}.${signature(userId, secret)}`;
}

/** Whether a cookie value was issued by this deployment for exactly this user. */
export function isOnboardedCookie(value: string | undefined, userId: string, secret: string) {
  if (!value) return false;
  const expected = Buffer.from(onboardedCookieValue(userId, secret));
  const actual = Buffer.from(value);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
