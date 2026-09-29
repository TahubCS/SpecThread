"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Circle, FileText, GitPullRequest, Tag, UserRoundCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";

type Provider = "google" | "github";
const providerLabels: Record<Provider, string> = { google: "Google", github: "GitHub" };
const MIN_PASSWORD_LENGTH = 12;
const TOO_MANY = "Too many attempts. Please wait a moment before trying again.";
const UNREACHABLE = "Unable to reach the sign-in service. Please try again.";

const evidenceSteps = [
  { label: "Requirement", icon: FileText },
  { label: "Issue", icon: Circle },
  { label: "PR", icon: GitPullRequest },
  { label: "Checks", icon: Check },
  { label: "Release", icon: Tag },
  { label: "Review", icon: UserRoundCheck },
] as const;

function AuthLayout({ children, signup }: { children: ReactNode; signup: boolean }) {
  return (
    <div className="auth-layout">
      {children}
      <aside className="auth-evidence" aria-label="SpecThread evidence path">
        <ol className="auth-evidence-steps">
          {evidenceSteps.map(({ label, icon: Icon }, index) => (
            <li key={label} className={index < 4 ? "is-linked" : "is-pending"}>
              <span className="auth-evidence-node"><Icon size={19} strokeWidth={1.7} aria-hidden="true" /></span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
        <p>{signup ? "Keep decisions tied to evidence." : "Evidence stays inspectable."}</p>
      </aside>
    </div>
  );
}

export function AuthForm({ signup = false }: { signup?: boolean }) {
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
        callbackURL: "/dashboard",
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
          callbackURL: "/dashboard",
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
        const result = await authClient.signIn.email({ email, password, callbackURL: "/dashboard" });
        if (result.error) {
          if (result.error.status === 403) {
            setPendingEmail(email);
          } else {
            setError(result.error.status === 429 ? TOO_MANY
              : result.error.status === 401 ? "Incorrect email or password."
                : "Unable to log in. Please try again.");
          }
        } else {
          router.push("/dashboard");
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
      const result = await authClient.sendVerificationEmail({ email: pendingEmail, callbackURL: "/dashboard" });
      if (result.error) setError(result.error.status === 429 ? TOO_MANY : "Unable to send the email. Please try again.");
      else setStatus("If an account needs verification, a new email is on its way.");
    } catch {
      setError(UNREACHABLE);
    }
    setBusy(null);
  }

  const alert = error && <p role="alert" className="notice text-red-600">{error}</p>;

  if (pendingEmail) {
    return (
      <AuthLayout signup={signup}>
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
    <AuthLayout signup={signup}>
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
        <Link href={signup ? "/login" : "/signup"}>{signup ? "Log in" : "Sign up"}</Link>
      </p>
      <p><Link href="/dashboard">Explore the dashboard preview</Link></p>
    </section>
    </AuthLayout>
  );
}
