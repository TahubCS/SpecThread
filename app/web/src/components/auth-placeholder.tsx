"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function AuthPlaceholder({ signup = false }: { signup?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGitHubSignIn() {
    setLoading(true);
    setError(null);
    try {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: "/dashboard",
        errorCallbackURL: "/auth/error",
      });
      if (result.error) {
        setError(result.error.status === 429
          ? "Too many sign-in attempts. Please wait a moment before trying again."
          : "Unable to start GitHub sign-in. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Unable to reach the sign-in service. Please try again.");
      setLoading(false);
    }
  }

  return (
    <section className="panel auth-panel stack">
      <h1>{signup ? "Create your account" : "Welcome back"}</h1>
      <p>{signup ? "Join your team to track requirements and their evidence." : "Log in to return to your team's workspace."}</p>
      {error && (
        <p role="alert" className="notice text-red-600">
          {error}
        </p>
      )}
      <button
        className="button"
        type="button"
        disabled={loading}
        onClick={handleGitHubSignIn}
      >
        {loading ? "Connecting to GitHub..." : signup ? "Sign up with GitHub" : "Log in with GitHub"}
      </button>
      <p>
        {signup ? "Already have an account? " : "New to SpecThread? "}
        <Link href={signup ? "/login" : "/signup"}>{signup ? "Log in" : "Sign up"}</Link>
      </p>
      <Link href="/dashboard">Explore the dashboard preview</Link>
    </section>
  );
}
