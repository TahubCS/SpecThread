import Link from "next/link";

export default function Home() {
  return (
    <div className="stack">
      <p className="eyebrow">Requirements and evidence</p>
      <h1>Follow the work behind every requirement.</h1>
      <p className="intro">
        SpecThread brings requirements, GitHub activity, checks, and review
        decisions together so your team can see what supports each delivery.
      </p>
      <div className="actions">
        <Link className="button" href="/signup">Get started</Link>
        <Link className="button secondary" href="/dashboard">Preview dashboard</Link>
      </div>
      <section className="panel" aria-labelledby="workflow-heading">
        <h2 id="workflow-heading">A simple workflow</h2>
        <ol className="steps">
          <li>Write a requirement and its acceptance criteria.</li>
          <li>Connect the issues, code, and checks that support it.</li>
          <li>Review the evidence and record a human decision.</li>
        </ol>
        <p className="muted">Passing checks are evidence. Acceptance stays with your team.</p>
      </section>
    </div>
  );
}
