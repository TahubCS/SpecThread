import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { auth } from "@/lib/auth";
import { safeNextPath } from "@/lib/app-navigation";

export const metadata: Metadata = { title: "Log in" };

/**
 * Renders the login screen when the request has no valid session; otherwise redirects to the
 * validated `next` path, defaulting to /dashboard. Session lookup may refresh stored sessions
 * or remove expired ones.
 *
 * @throws Propagates session lookup errors; a failed lookup does not render the form.
 */
export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeNextPath((await searchParams).next);
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect(next);
  return <AuthForm next={next} />;
}
