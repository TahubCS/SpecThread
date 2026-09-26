import Link from "next/link";

/** Renders the unknown-route message with a link back to the dashboard. */
export default function NotFound() {
  return (
    <section className="stack">
      <h1>Page not found</h1>
      <p className="intro">This address does not match a SpecThread page.</p>
      <Link href="/dashboard">Go to dashboard</Link>
    </section>
  );
}
