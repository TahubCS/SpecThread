"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DEFAULT_AFTER_SIGN_IN } from "@/lib/app-navigation";
import { authClient } from "@/lib/auth-client";
import { AuthLayout } from "./auth-layout";

type Provider = "google" | "github";
const providerLabels: Record<Provider, string> = { google: "Google", github: "GitHub" };
const MIN_PASSWORD_LENGTH = 12;
const TOO_MANY = "Too many attempts. Please wait a moment before trying again.";
const UNREACHABLE = "Unable to reach the sign-in service. Please try again.";

/** Renders the login or signup form; every sign-in path returns to `next`, a pre-validated same-site path. */
export function AuthForm({ signup = false, next = DEFAULT_AFTER_SIGN_IN }: { signup?: boolean; next?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"email" | Provider | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  async function handleSocial(provider: Provider) {
    setBusy(provider);
    setError(null);
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: next,
        errorCallbackURL: "/auth/error",
      });
      if (result.error) {
        setError(result.error.status === 429 ? TOO_MANY : `Unable to start ${providerLabels[provider]} sign-in. Please try again.`);
        setBusy(null);
      }
    } catch {
      setError(UNREACHABLE);
      setBusy(null);
    }
  }

  async function handleEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setBusy("email");
    setError(null);
    setStatus(null);
    try {
      if (signup) {
        const result = await authClient.signUp.email({
          name: String(form.get("name") ?? "").trim(),
          email,
          password,
          callbackURL: next,
        });
        if (result.error) {
          setError(result.error.status === 429 ? TOO_MANY
            : result.error.code === "PASSWORD_TOO_SHORT" ? `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`
              : "Unable to create your account. Check your details and try again.");
        } else {
          // Better Auth answers the same way for new and existing emails, so this
          // does not reveal whether an account already exists.
          setPendingEmail(email);
        }
      } else {
        const result = await authClient.signIn.email({ email, password, callbackURL: next });
        if (result.error) {
          if (result.error.status === 403) {
            setPendingEmail(email);
          } else {
            setError(result.error.status === 429 ? TOO_MANY
              : result.error.status === 401 ? "Incorrect email or password."
                : "Unable to log in. Please try again.");
          }
        } else {
          router.push(next);
          router.refresh();
          return;
        }
      }
    } catch {
      setError(UNREACHABLE);
    }
    setBusy(null);
  }

  async function handleResend() {
    if (!pendingEmail) return;
    setBusy("resend");
    setError(null);
    setStatus(null);
    try {
      const result = await authClient.sendVerificationEmail({ email: pendingEmail, callbackURL: next });
      if (result.error) setError(result.error.status === 429 ? TOO_MANY : "Unable to send the email. Please try again.");
      else setStatus("If an account needs verification, a new email is on its way.");
    } catch {
      setError(UNREACHABLE);
    }
    setBusy(null);
  }

  const alert = error && <p role="alert" className="notice notice-error">{error}</p>;

  if (pendingEmail) {
    return (
      <AuthLayout caption={signup ? "Keep decisions tied to evidence." : undefined}>
      <section className="auth-panel stack">
        <h1>Check your email</h1>
        <p>
          {signup ? "We sent a verification link to " : "Verify your email before logging in. We can send a new link to "}
          <strong>{pendingEmail}</strong>. The link signs you in once your email is confirmed.
        </p>
        {alert}
        {status && <p role="status" className="notice">{status}</p>}
        <button className="button secondary" type="button" disabled={busy !== null} onClick={handleResend}>
          {busy === "resend" ? "Sending..." : "Resend verification email"}
        </button>
        <button className="link-button" type="button" onClick={() => { setPendingEmail(null); setError(null); setStatus(null); }}>
          Use a different email
        </button>
      </section>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout caption={signup ? "Keep decisions tied to evidence." : undefined}>
    <section className="auth-panel stack">
      <p className="auth-kicker">{signup ? "Start with your team" : "Your workspace"}</p>
      <h1>{signup ? "Create your account" : "Welcome back"}</h1>
      <p>{signup ? "Join your team to track requirements and their evidence." : "Log in to return to your team's workspace."}</p>
      {alert}
      <form className="auth-form" onSubmit={handleEmail} aria-label={signup ? "Sign up with email" : "Log in with email"}>
        {signup && (
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" type="text" autoComplete="name" required maxLength={100} />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            required
            minLength={signup ? MIN_PASSWORD_LENGTH : undefined}
            aria-describedby={signup ? "password-hint" : undefined}
          />
          {signup && <p id="password-hint" className="muted">At least {MIN_PASSWORD_LENGTH} characters.</p>}
        </div>
        <button className="button" type="submit" disabled={busy !== null}>
          {busy === "email" ? (signup ? "Creating account..." : "Logging in...") : signup ? "Sign up" : "Log in"}
        </button>
      </form>
      {!signup && <p><Link href="/forgot-password">Forgot your password?</Link></p>}
      <p className="divider">or</p>
      <div className="social-buttons">
        {(["google", "github"] as const).map(provider => (
          <button key={provider} className="button secondary" type="button" disabled={busy !== null} onClick={() => handleSocial(provider)}>
            {busy === provider ? `Connecting to ${providerLabels[provider]}...` : `Continue with ${providerLabels[provider]}`}
          </button>
        ))}
      </div>
      <p>
        {signup ? "Already have an account? " : "New to SpecThread? "}
        <Link href={`${signup ? "/login" : "/signup"}${next === DEFAULT_AFTER_SIGN_IN ? "" : `?next=${encodeURIComponent(next)}`}`}>
          {signup ? "Log in" : "Sign up"}
        </Link>
      </p>
    </section>
    </AuthLayout>
  );
}
