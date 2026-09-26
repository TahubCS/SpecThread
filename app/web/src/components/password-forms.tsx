"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD_LENGTH = 12;
const TOO_MANY = "Too many attempts. Please wait a moment before trying again.";
const UNREACHABLE = "Unable to reach the sign-in service. Please try again.";

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      if (result.error) setError(result.error.status === 429 ? TOO_MANY : "Unable to send a reset link. Please try again.");
      else setSent(true);
    } catch {
      setError(UNREACHABLE);
    }
    setBusy(false);
  }

  return (
    <section className="panel auth-panel stack">
      <h1>Reset your password</h1>
      {sent ? (
        // The same message is shown whether or not the email has an account.
        <p role="status" className="notice">If an account uses that email, we sent a link to reset its password.</p>
      ) : (
        <>
          <p>Enter your account email and we will send you a link to choose a new password.</p>
          {error && <p role="alert" className="notice text-red-600">{error}</p>}
          <form className="auth-form" onSubmit={handleSubmit} aria-label="Request a password reset">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <button className="button" type="submit" disabled={busy}>{busy ? "Sending..." : "Send reset link"}</button>
          </form>
        </>
      )}
      <p><Link href="/login">Back to log in</Link></p>
    </section>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(token === null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password") ?? "");
    if (newPassword !== String(form.get("confirm") ?? "")) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.resetPassword({ newPassword, token });
      if (!result.error) setDone(true);
      else if (result.error.status === 429) setError(TOO_MANY);
      else if (result.error.code === "PASSWORD_TOO_SHORT") setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
      else setExpired(true);
    } catch {
      setError(UNREACHABLE);
    }
    setBusy(false);
  }

  if (expired) {
    return (
      <section className="panel auth-panel stack">
        <h1>Reset link expired</h1>
        <p>This password reset link is invalid or has already been used. Request a new one to continue.</p>
        <Link className="button" href="/forgot-password">Request a new link</Link>
      </section>
    );
  }

  if (done) {
    return (
      <section className="panel auth-panel stack">
        <h1>Password updated</h1>
        <p role="status">Your password was changed and other sessions were signed out.</p>
        <Link className="button" href="/login">Log in</Link>
      </section>
    );
  }

  return (
    <section className="panel auth-panel stack">
      <h1>Choose a new password</h1>
      {error && <p role="alert" className="notice text-red-600">{error}</p>}
      <form className="auth-form" onSubmit={handleSubmit} aria-label="Choose a new password">
        <div className="field">
          <label htmlFor="password">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required
            minLength={MIN_PASSWORD_LENGTH} aria-describedby="password-hint" />
          <p id="password-hint" className="muted">At least {MIN_PASSWORD_LENGTH} characters.</p>
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirm new password</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} />
        </div>
        <button className="button" type="submit" disabled={busy}>{busy ? "Saving..." : "Update password"}</button>
      </form>
    </section>
  );
}
