"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DEFAULT_AFTER_SIGN_IN } from "@/lib/app-navigation";
import { authClient } from "@/lib/auth-client";
import { SignInThread } from "./sign-in-thread";

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

  const alert = error && <p role="alert" className="signin-alert">{error}</p>;

  if (pendingEmail) {
    return (
      <SignInShell>
        <h1 className="signin-title">Check your email</h1>
        <p className="signin-lead">
          {signup ? "We sent a verification link to " : "Verify your email before logging in. We can send a new link to "}
          <strong>{pendingEmail}</strong>. The link signs you in once your email is confirmed.
        </p>
        {alert}
        {status && <p role="status" className="signin-status">{status}</p>}
        <div className="signin-stack">
          <button className="signin-secondary" type="button" disabled={busy !== null} onClick={handleResend}>
            {busy === "resend" ? "Sending..." : "Resend verification email"}
          </button>
          <button className="signin-text-button" type="button" onClick={() => { setPendingEmail(null); setError(null); setStatus(null); }}>
            Use a different email
          </button>
        </div>
      </SignInShell>
    );
  }

  return (
    <SignInShell>
      <h1 className="signin-title">{signup ? "Create your account" : "Log in to SpecThread"}</h1>
      {signup && <p className="signin-lead">Connect one GitHub repository. Free for small teams.</p>}
      {alert}
      <div className="signin-stack">
        {(["github", "google"] as const).map(provider => (
          <button key={provider} className="signin-secondary" type="button" disabled={busy !== null} onClick={() => handleSocial(provider)}>
            {busy === provider ? `Connecting to ${providerLabels[provider]}...` : `Continue with ${providerLabels[provider]}`}
          </button>
        ))}
      </div>
      <div className="signin-divider" aria-hidden="true"><span />OR<span /></div>
      <form className="signin-stack" onSubmit={handleEmail} aria-label={signup ? "Sign up with email" : "Log in with email"}>
        {signup && (
          <div className="signin-field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" type="text" autoComplete="name" placeholder="Maya Ruiz" required maxLength={100} />
          </div>
        )}
        <div className="signin-field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
        </div>
        <div className="signin-field">
          <div className="signin-label-row">
            <label htmlFor="password">Password</label>
            {!signup && <Link href="/forgot-password">Forgot password?</Link>}
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            placeholder={signup ? undefined : "••••••••••••"}
            required
            minLength={signup ? MIN_PASSWORD_LENGTH : undefined}
            aria-describedby={signup ? "password-hint" : undefined}
          />
          {signup && <span id="password-hint" className="signin-hint">At least {MIN_PASSWORD_LENGTH} characters.</span>}
        </div>
        <button className="landing-primary signin-submit" type="submit" disabled={busy !== null}>
          {busy === "email" ? (signup ? "Creating account..." : "Logging in...") : signup ? "Create account" : "Log in"}
        </button>
        {signup && (
          <p className="signin-terms">
            By signing up you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
          </p>
        )}
      </form>
      <p className="signin-switch">
        {signup ? "Already have an account? " : "New to SpecThread? "}
        <Link href={`${signup ? "/login" : "/signup"}${next === DEFAULT_AFTER_SIGN_IN ? "" : `?next=${encodeURIComponent(next)}`}`}>
          {signup ? "Log in" : "Sign up"}
        </Link>
      </p>
    </SignInShell>
  );
}

/** Sign-in page shell from the design: brand, the form column, and the animated evidence thread. */
function SignInShell({ children }: { children: ReactNode }) {
  return (
    <div className="landing signin">
      <div className="signin-side">
        <div className="signin-top">
          <Link className="landing-brand" href="/">
            <Image src="/thread-mark.png" alt="" width={34} height={20} unoptimized />SpecThread
          </Link>
        </div>
        <main id="main-content" tabIndex={-1} className="signin-main">
          <section>{children}</section>
        </main>
        <footer className="signin-footer">
          <span>© 2026 SpecThread</span>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </footer>
      </div>
      <SignInThread />
    </div>
  );
}
