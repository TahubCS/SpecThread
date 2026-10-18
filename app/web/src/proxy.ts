import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isPublicPath } from "@/lib/app-navigation";
import { apiFetch } from "@/lib/api";
import { parseOnboarding } from "@/lib/team-types";
import { ONBOARDED_COOKIE, ONBOARDED_MAX_AGE, isOnboardedCookie, onboardedCookieValue } from "@/lib/onboarding-cookie";

/**
 * Deny-by-default page gate (ADR-023). Public pages pass through; every other page needs a
 * valid Better Auth session, otherwise the visitor goes to /login with the requested path and
 * query in `next`. Session lookup errors propagate, so a failed lookup never renders the page.
 * Cookies Better Auth sets during the lookup (a refreshed session, or clearing an invalid one)
 * are forwarded, so the rolling session keeps extending while the user browses.
 * Finished first-team setup is remembered in a signed cookie, so only the first navigation
 * after signing in asks the API (ADR-042).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  const { headers, response: session } = await auth.api.getSession({ headers: request.headers, returnHeaders: true });
  let result = NextResponse.next();
  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    result = NextResponse.redirect(login);
  } else if (pathname !== "/onboarding" &&
    !isOnboardedCookie(request.cookies.get(ONBOARDED_COOKIE)?.value, session.user.id, auth.options.secret)) {
    const state = await apiFetch("/onboarding", {}, request.headers);
    if (!state.ok) throw new Error("Account setup could not be checked.");
    if (!parseOnboarding(await state.json()).completed) {
      result = NextResponse.redirect(new URL("/onboarding", request.url));
    } else {
      result.cookies.set(ONBOARDED_COOKIE, onboardedCookieValue(session.user.id, auth.options.secret), {
        httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: ONBOARDED_MAX_AGE,
      });
    }
  }
  for (const cookie of headers.getSetCookie()) result.headers.append("set-cookie", cookie);
  return result;
}

// Skips API routes, Next.js internals and dev tooling, and exactly the public image files.
export const config = {
  matcher: ["/((?!api/|_next/|__nextjs|(?:icon\\.png|thread-mark\\.png|favicon\\.ico)$).*)"],
};
