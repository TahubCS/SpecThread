import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/** Renders links to the product explanation, privacy, and terms pages. */
export default function AboutPage() {
  return (
    <section className="scaffold-page" aria-labelledby="about-title">
      <header className="scaffold-heading">
        <p className="scaffold-kicker">SpecThread / About</p>
        <h1 id="about-title">About SpecThread</h1>
        <p>Learn how SpecThread works and find its policy pages.</p>
      </header>
      <nav className="scaffold-navigation" aria-label="About pages">
        <div className="scaffold-navigation-heading"><h2>Explore SpecThread</h2></div>
        <div className="scaffold-links">
          <Link className="scaffold-link" href="/about/how-it-works"><span>How SpecThread works</span><ArrowUpRight size={17} aria-hidden="true" /></Link>
          <Link className="scaffold-link" href="/about/privacy"><span>Privacy</span><ArrowUpRight size={17} aria-hidden="true" /></Link>
          <Link className="scaffold-link" href="/about/terms"><span>Terms of use</span><ArrowUpRight size={17} aria-hidden="true" /></Link>
        </div>
      </nav>
    </section>
  );
}
