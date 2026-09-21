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
  const cancelled = error === "access_denied";
  const expired = error === "state_not_found" || error === "state_mismatch";
  const message = cancelled
    ? "GitHub sign-in was cancelled. You can try again when you are ready."
    : expired
      ? "This sign-in attempt could not be verified. Start a new attempt to continue."
      : "We could not complete GitHub sign-in. Please try again.";

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
