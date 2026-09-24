"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="stack" role="alert">
      <h1>Page unavailable</h1>
      <p className="intro">Something went wrong while opening this page.</p>
      <button className="button" onClick={reset} type="button">Try again</button>
    </section>
  );
}
