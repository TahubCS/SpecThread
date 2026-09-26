import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign-in unsuccessful",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function AuthErrorPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const code = typeof error === "string" ? error : "";
  const cancelled = code === "access_denied";
  // Fixed messages only: provider-supplied descriptions are never rendered.
  const message = cancelled
    ? "Sign-in was cancelled. You can try again when you are ready."
    : ["state_not_found", "state_mismatch", "state_invalid", "state_security_mismatch"].includes(code)
      ? "This sign-in attempt could not be verified. Start a new attempt to continue."
      : code === "account_already_linked_to_different_user"
        ? "That account is already linked to a different SpecThread account. Sign in with it instead, or unlink it there first."
        : code === "account_not_linked"
          ? "An account with this email already exists. Log in with your existing method, verify your email if needed, then link this provider from your account page."
          : ["unable_to_link_account", "email_does_not_match"].includes(code)
            ? "We could not link that account. Please try again from your account page."
            : "We could not complete sign-in. Please try again.";

  return (
    <section className="panel auth-panel stack">
      <h1>{cancelled ? "Sign-in cancelled" : "Sign-in unsuccessful"}</h1>
      <p>{message}</p>
      <div className="actions">
        <Link className="button" href="/login">Try signing in again</Link>
        <Link href="/">Return home</Link>
      </div>
    </section>
  );
}
