import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthPlaceholder } from "@/components/auth-placeholder";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");
  return <AuthPlaceholder signup />;
}
