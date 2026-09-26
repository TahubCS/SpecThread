import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthPlaceholder } from "@/components/auth-placeholder";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Log in" };

/**
 * Renders the GitHub login screen when the request has no valid session;
 * otherwise redirects to /dashboard. Session lookup may refresh stored sessions
 * or remove expired ones.
 *
 * @throws Propagates session lookup errors; a failed lookup does not render the form.
 */
export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");
  return <AuthPlaceholder />;
}
