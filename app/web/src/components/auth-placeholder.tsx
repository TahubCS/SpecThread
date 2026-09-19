import Link from "next/link";

export function AuthPlaceholder({ signup = false }: { signup?: boolean }) {
  return (
    <section className="panel auth-panel stack">
      <h1>{signup ? "Create your account" : "Welcome back"}</h1>
      <p>{signup ? "Join your team to track requirements and their evidence." : "Log in to return to your team's workspace."}</p>
      <p id="auth-status" className="notice">
        GitHub sign-in is not available yet. No account is created in this preview.
      </p>
      <button className="button" type="button" disabled aria-describedby="auth-status">
        {signup ? "Sign up with GitHub" : "Log in with GitHub"}
      </button>
      <p>
        {signup ? "Already have an account? " : "New to SpecThread? "}
        <Link href={signup ? "/login" : "/signup"}>{signup ? "Log in" : "Sign up"}</Link>
      </p>
      <Link href="/dashboard">Explore the dashboard preview</Link>
    </section>
  );
}
