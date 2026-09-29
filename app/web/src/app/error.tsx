"use client";

/** Renders a page error alert and invokes the supplied reset callback when the user retries. */
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="scaffold-page" role="alert" aria-labelledby="error-title">
      <header className="scaffold-heading">
        <p className="scaffold-kicker">SpecThread / Error</p>
        <h1 id="error-title">Page unavailable</h1>
        <p>Something went wrong while opening this page.</p>
      </header>
      <div className="scaffold-navigation">
        <button className="button" onClick={reset} type="button">Try again</button>
      </div>
    </section>
  );
}
