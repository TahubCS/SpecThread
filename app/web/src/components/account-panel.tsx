"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Provider = "google" | "github";
const labels: Record<string, string> = { credential: "Email and password", google: "Google", github: "GitHub" };
const TOO_MANY = "Too many attempts. Please wait a moment before trying again.";

export function AccountPanel({ user, linked, available }: {
  user: { name: string; email: string; emailVerified: boolean };
  linked: { id: string; providerId: string }[];
  available: Provider[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<{ error: { status: number } | null }>, failure: string, forbidden = failure) {
    setBusy(key);
    setError(null);
    try {
      const result = await action();
      if (result.error) {
        setError(result.error.status === 429 ? TOO_MANY : result.error.status === 403 ? forbidden : failure);
        setBusy(null);
        return false;
      }
      return true;
    } catch {
      setError("Unable to reach the sign-in service. Please try again.");
      setBusy(null);
      return false;
    }
  }

  // Redirects to the provider; the callback returns to /account or /auth/error.
  const link = (provider: Provider) => run(`link-${provider}`,
    () => authClient.linkSocial({ provider, callbackURL: "/account", errorCallbackURL: "/auth/error" }),
    `Unable to start linking ${labels[provider]}. Please try again.`);

  async function unlink(account: { id: string; providerId: string }) {
    const label = labels[account.providerId] ?? account.providerId;
    // Better Auth requires a recent sign-in (fresh session) to unlink.
    if (await run(`unlink-${account.id}`, () => authClient.unlinkAccount({ accountId: account.id }),
      `Unable to unlink ${label}. You must keep at least one way to sign in.`,
      `For your security, log out and log in again before removing ${label}.`)) {
      setBusy(null);
      router.refresh();
    }
  }

  async function signOut() {
    if (await run("sign-out", () => authClient.signOut(), "Unable to sign out. Please try again.")) {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="stack">
      <h1>Account</h1>
      {error && <p role="alert" className="notice text-red-600">{error}</p>}
      <section className="panel stack" aria-labelledby="profile-heading">
        <h2 id="profile-heading">Profile</h2>
        <dl className="details">
          <dt>Name</dt><dd>{user.name}</dd>
          <dt>Email</dt><dd>{user.email} <span className="muted">({user.emailVerified ? "verified" : "not verified"})</span></dd>
        </dl>
      </section>
      <section className="panel stack" aria-labelledby="methods-heading">
        <h2 id="methods-heading">Sign-in methods</h2>
        <ul className="method-list">
          {linked.map(account => (
            <li key={account.id}>
              <span>{labels[account.providerId] ?? account.providerId}</span>
              <button className="button secondary" type="button" disabled={busy !== null || linked.length < 2}
                onClick={() => unlink(account)} aria-label={`Unlink ${labels[account.providerId] ?? account.providerId}`}>
                {busy === `unlink-${account.id}` ? "Unlinking..." : "Unlink"}
              </button>
            </li>
          ))}
        </ul>
        {linked.length < 2 && <p className="muted">Link another method before removing this one.</p>}
        <div className="actions">
          {available.filter(provider => !linked.some(account => account.providerId === provider)).map(provider => (
            <button key={provider} className="button" type="button" disabled={busy !== null} onClick={() => link(provider)}>
              {busy === `link-${provider}` ? `Connecting to ${labels[provider]}...` : `Link ${labels[provider]}`}
            </button>
          ))}
        </div>
      </section>
      <button className="button secondary" type="button" disabled={busy !== null} onClick={signOut}>
        {busy === "sign-out" ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}
