import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/password-forms";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({ searchParams }: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}) {
  const { token, error } = await searchParams;
  // Better Auth redirects here with ?error=INVALID_TOKEN for expired or used links.
  const valid = typeof token === "string" && token.length > 0 && !error;
  return <ResetPasswordForm token={valid ? token : null} />;
}
