export type Frame = "public" | "settings" | "workspace";

/** Routes shown without an app sidebar: the landing page, the sign-in flow, and policy pages. */
const publicRoutes = ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/auth/error", "/privacy", "/terms"];

/** Only the token preview and its legacy expiry URL bypass first-team setup. */
export function isInvitationPath(pathname: string) {
  return /^\/invites\/[\da-f]{64}(?:\/expired)?$/i.test(pathname);
}

/** Reports whether a page renders without a session; every other page requires sign-in (ADR-023). */
export function isPublicPath(pathname: string) {
  return publicRoutes.includes(pathname) || isInvitationPath(pathname);
}

export const DEFAULT_AFTER_SIGN_IN = "/dashboard";

/**
 * Returns `value` when it is a same-site path to return to after signing in, else the dashboard.
 * Rejects non-strings, other origins (`//host`, schemes), any backslash, control characters,
 * encoded slashes or backslashes in the path, values over 2048 characters, and the login and
 * signup pages, which would loop. This is at least as strict as Better Auth's own callbackURL
 * check, so an accepted value never makes sign-in fail with INVALID_CALLBACK_URL.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return DEFAULT_AFTER_SIGN_IN;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return DEFAULT_AFTER_SIGN_IN;
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return DEFAULT_AFTER_SIGN_IN;
  const path = value.split(/[?#]/)[0];
  if (/%2f|%5c/i.test(path)) return DEFAULT_AFTER_SIGN_IN;
  if (path === "/login" || path === "/signup") return DEFAULT_AFTER_SIGN_IN;
  return value;
}

/** Prefixes for personal, help, and onboarding pages that use the settings sidebar. */
const settingsPrefixes = ["/settings", "/account", "/help", "/welcome", "/onboarding", "/invites"];

/**
 * Chooses the page frame for a pathname without a query string. Public routes match exactly.
 * Settings prefixes match themselves and their descendants. Every other path, including
 * unknown routes, uses the workspace sidebar, so no new route can gain the top header.
 */
export function frameFor(pathname: string): Frame {
  if (pathname === "/onboarding") return "public";
  if (isPublicPath(pathname)) return "public";
  if (settingsPrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) return "settings";
  return "workspace";
}

/** Links whose descendants have their own sidebar entries, so they highlight only on an exact match. */
const exactLinks = new Set(["/settings"]);

/** Reports whether a settings sidebar link represents the current pathname. */
export function isCurrentLink(href: string, pathname: string) {
  return pathname === href || (!exactLinks.has(href) && pathname.startsWith(`${href}/`));
}

/**
 * Returns up to two uppercase initials from the first two words of a display name,
 * falling back to the email's first character and then "?". Handles non-BMP characters.
 */
export function initialsOf(name: string, email = "") {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => [...word][0]).join("");
  return (initials || [...email.trim()][0] || "?").toUpperCase();
}
