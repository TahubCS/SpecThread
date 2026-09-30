import Link from "next/link";

/** Renders the unknown-route message with a link back to the dashboard. */
export default function NotFound() {
  return (
    <section className="scaffold-page" aria-labelledby="not-found-title">
      <header className="scaffold-heading">
        <p className="scaffold-kicker">SpecThread / 404</p>
        <h1 id="not-found-title">Page not found</h1>
        <p>This address does not match a SpecThread page.</p>
      </header>
      <div className="scaffold-navigation">
        <Link className="button" href="/dashboard">Go to dashboard</Link>
      </div>
    </section>
  );
}
