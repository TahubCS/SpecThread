import Link from "next/link";

/** Renders links to the product explanation, privacy, and terms pages. */
export default function AboutPage() {
  return (
    <section className="stack">
      <h1>About SpecThread</h1>
      <p className="intro">Learn how SpecThread works and find its policy pages.</p>
      <ul>
        <li><Link href="/about/how-it-works">How SpecThread works</Link></li>
        <li><Link href="/about/privacy">Privacy</Link></li>
        <li><Link href="/about/terms">Terms of use</Link></li>
      </ul>
    </section>
  );
}
