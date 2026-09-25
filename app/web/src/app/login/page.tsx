import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthPlaceholder } from "@/components/auth-placeholder";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");
  return <AuthPlaceholder />;
}
