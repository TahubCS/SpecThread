export type Frame = "public" | "settings" | "workspace";

/** Routes shown without an app sidebar: the landing page, the sign-in flow, and policy pages. */
const publicRoutes = ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/auth/error", "/privacy", "/terms"];

/** Prefixes for personal, help, and onboarding pages that use the settings sidebar. */
const settingsPrefixes = ["/settings", "/account", "/help", "/welcome", "/onboarding", "/invites"];

/**
 * Chooses the page frame for a pathname without a query string. Public routes match exactly.
 * Settings prefixes match themselves and their descendants. Every other path, including
 * unknown routes, uses the workspace sidebar, so no new route can gain the top header.
 */
export function frameFor(pathname: string): Frame {
  if (publicRoutes.includes(pathname)) return "public";
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
