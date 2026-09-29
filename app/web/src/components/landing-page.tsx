"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { Menu, Pause, Play, RotateCw } from "lucide-react";
import { authClient } from "@/lib/auth-client";

type StatusKey = "accepted" | "complete" | "failed" | "linked" | "draft" | "collecting" | "live";

const STATUS: Record<Exclude<StatusKey, "live">, [string, string]> = {
  accepted: ["Accepted", "var(--ok)"],
  complete: ["Evidence complete", "var(--accent)"],
  failed: ["Check failed", "var(--bad)"],
  linked: ["Linked", "var(--muted)"],
  draft: ["Draft", "var(--faint)"],
  collecting: ["Collecting evidence", "var(--warn)"],
};

const REQUIREMENTS: { id: string; title: string; evidence: string[]; status: StatusKey; reviewer?: string }[] = [
  { id: "REQ-101", title: "Export invoices as CSV", evidence: ["#212", "#48", "3", "12/12", "v1.4.0"], status: "accepted", reviewer: "MR" },
  { id: "REQ-102", title: "Retry failed webhook deliveries", evidence: ["#219", "#51", "5", "18/18", "v1.4.0"], status: "complete" },
  { id: "REQ-103", title: "Lock accounts after five failed logins", evidence: ["#224", "#56", "4", "9/9", "v1.5.0-rc"], status: "live" },
  { id: "REQ-104", title: "Show tax breakdown on receipts", evidence: ["#226", "#58", "2", "11/12", "—"], status: "failed" },
  { id: "REQ-105", title: "Archive inactive projects", evidence: ["#230", "—", "—", "—", "—"], status: "linked" },
  { id: "REQ-106", title: "Weekly usage summary email", evidence: ["—", "—", "—", "—", "—"], status: "draft" },
];

/** Hero animation frames: evidence cells appear one per step, then the status turns complete at step 6. */
const LAST_STEP = 12;

type Artifact = { kicker: string; title: string; meta: string; date: string; scattered: [number, number, number]; color?: string };

const ARTIFACTS: Artifact[] = [
  { kicker: "Requirement", title: "REQ-103", meta: "Lock accounts after five failed logins", date: "Sep 02", scattered: [40, 30, -6], color: "var(--accent)" },
  { kicker: "GitHub issue", title: "#224", meta: "Linked to REQ-103", date: "Sep 03", scattered: [860, 10, 5] },
  { kicker: "Pull request", title: "#56", meta: "Merged into main", date: "Sep 09", scattered: [330, 300, -3] },
  { kicker: "Commits", title: "4 commits", meta: "a3f9c12 · 7be01d4 …", date: "Sep 09", scattered: [640, 250, 8] },
  { kicker: "Checks", title: "9/9 passed", meta: "auth-e2e · unit", date: "Sep 10", scattered: [120, 260, 4], color: "var(--ok)" },
  { kicker: "Release", title: "v1.5.0-rc", meta: "Deployed to staging", date: "Sep 12", scattered: [930, 290, -7] },
];

const CRITERIA = [
  { text: "Account locks after the fifth failed attempt within 15 minutes", evidence: "auth-e2e › lockout ✓", color: "var(--ok)" },
  { text: "Locked user receives an unlock email", evidence: "auth-e2e › unlock-mail ✓", color: "var(--ok)" },
  { text: "Admins can unlock an account from its settings page", evidence: "PR #56", color: "var(--fg)" },
];

const ABOUT = [
  { title: "The problem", body: "A board can show that a task moved to “Done”, but not which code implemented the requirement, which checks ran, or whether it reached a release." },
  { title: "Who it is for", body: "Small software teams, the project managers and clients who need a readable view of progress, and the developers and reviewers who need direct links to evidence." },
  { title: "People decide", body: "SpecThread keeps the evidence inspectable in one thread. Links can be suggested, but an authorized reviewer makes every acceptance decision." },
];

const STEPS = [
  { n: "01", title: "Write the requirement", body: "State what was requested and the acceptance criteria that would show it works." },
  { n: "02", title: "Link the work", body: "Connect a GitHub repository. Link the issue and pull requests; commits and checks that reference them come along." },
  { n: "03", title: "Review the thread", body: "Evidence lands in one chronological thread. A reviewer accepts, rejects, or asks for more." },
];

const TERMS = [
  { term: "Linked", color: "var(--fg)", def: "An explicit or confirmed relationship to the requirement." },
  { term: "Check passed", color: "var(--ok)", def: "A recorded automated check reported success." },
  { term: "Evidence complete", color: "var(--accent)", def: "The project's evidence policy is satisfied." },
  { term: "Accepted", color: "var(--fg)", def: "An authorized person approved it." },
];

/** Returns a ref and whether its element is at least `threshold` visible. */
function useInView<T extends Element>(threshold = 0.4) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold });
    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

/** Subscribes to reduced-motion preference changes and returns a listener cleanup function. */
function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Tracks the visitor's reduced-motion preference; the server render assumes motion is allowed. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeToReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches, () => false);
}

/** Renders the decorative thread mark at the requested width, preserving its aspect ratio. */
function Logo({ size = 34 }: { size?: number }) {
  return <Image src="/thread-mark.png" alt="" width={size} height={Math.round(size * 0.59)} unoptimized />;
}

/** Closes the enclosing mobile menu after one of its links is followed. */
function closeMenuOnLink(event: MouseEvent<HTMLElement>) {
  if ((event.target as HTMLElement).closest("a")) event.currentTarget.closest("details")?.removeAttribute("open");
}

/** Renders the landing header; signed-in visitors see Dashboard instead of Log in and Sign up. */
function Header() {
  const { data: session, isPending } = authClient.useSession();
  const sections = (
    <>
      <a href="#about">About</a>
      <a href="#how">How it works</a>
      <a href="#evidence">Evidence</a>
      <a href="#review">Review</a>
    </>
  );
  const account = !isPending && (session ? (
    <Link className="landing-nav-cta" href="/dashboard">Dashboard</Link>
  ) : (
    <>
      <Link href="/login">Log in</Link>
      <Link className="landing-nav-cta" href="/signup">Sign up</Link>
    </>
  ));

  return (
    <header className="landing-header">
      <Link className="landing-brand" href="/"><Logo />SpecThread</Link>
      <nav className="landing-nav" aria-label="Main navigation">
        <div className="landing-nav-links">
          {sections}
          <span className="landing-nav-divider" aria-hidden="true" />
          {account}
        </div>
        <details className="landing-mobile-menu">
          <summary aria-label="Open navigation"><Menu size={20} aria-hidden="true" /></summary>
          <div className="landing-mobile-links" onClick={closeMenuOnLink}>
            {sections}
            {account}
          </div>
        </details>
      </nav>
    </header>
  );
}

/** Renders illustrative workspace and project entries inside the landing product preview. */
function MockSidebar() {
  const nav = [
    { label: "Requirements", count: 24, active: true },
    { label: "Evidence" },
    { label: "Reviews", count: 3, warn: true },
    { label: "Releases" },
  ];
  return (
    <div className="landing-mock-sidebar">
      <div className="landing-mock-heading">WORKSPACE</div>
      {nav.map(item => (
        <div key={item.label} className={`landing-mock-item${item.active ? " is-active" : ""}`}>
          <span className={`landing-dot ${item.active ? "is-filled" : "is-hollow"}`} />
          {item.label}
          {item.count !== undefined && <span className={`landing-mock-count${item.warn ? " is-warn" : ""}`}>{item.count}</span>}
        </div>
      ))}
      <div className="landing-mock-heading is-faint">PROJECTS</div>
      <div className="landing-mock-projects">
        {["billing-service", "auth-gateway", "docs-site"].map((project, index) => (
          <div key={project} className={index === 0 ? "is-active" : undefined}>{project}</div>
        ))}
      </div>
    </div>
  );
}

/** Renders sample requirements, revealing the live row's evidence and completion status as `step` advances. */
function RequirementsTable({ step }: { step: number }) {
  return (
    <div className="landing-table">
      <div className="landing-table-head">
        <div className="landing-table-title"><strong>Requirements</strong><span>24 total · 3 awaiting review</span></div>
        <div className="landing-tabs"><span className="is-active">All</span><span>Awaiting review</span><span>Accepted</span></div>
      </div>
      <div className="landing-table-grid landing-table-columns">
        {["ID", "REQUIREMENT", "ISSUE", "PR", "COMMITS", "CHECKS", "RELEASE", "STATUS", ""].map((heading, index) => <div key={index}>{heading}</div>)}
      </div>
      {REQUIREMENTS.map(requirement => {
        const live = requirement.status === "live";
        const key = live ? (step >= 6 ? "complete" : "collecting") : requirement.status;
        const [label, color] = STATUS[key as Exclude<StatusKey, "live">];
        return (
          <div key={requirement.id} className={`landing-table-grid landing-table-row${live ? " is-live" : ""}`}>
            <div className="landing-table-id">{requirement.id}</div>
            <div className="landing-table-name">{requirement.title}</div>
            {requirement.evidence.map((value, index) => {
              const empty = value === "—";
              let color = empty ? "var(--faint)" : "var(--fg)";
              if (index === 3 && !empty) {
                const [passed, total] = value.split("/");
                color = passed === total ? "var(--ok)" : "var(--bad)";
              }
              const hidden = live && step <= index;
              return (
                <div key={index} className="landing-table-cell"
                  style={{ color, opacity: hidden ? 0 : 1, transform: hidden ? "translateY(5px)" : "none" }}>{value}</div>
              );
            })}
            <div className="landing-table-status" style={{ color }}>
              <span className="landing-dot" style={{ background: color }} />{label}
            </div>
            <div className="landing-table-reviewer" style={{ opacity: requirement.reviewer ? 1 : 0 }}>{requirement.reviewer}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Renders the illustrative product window. It is one image to assistive technology,
 * and a pause control is offered whenever the animation can play.
 */
function ProductWindow({ step, paused, reduced, onTogglePause }: {
  step: number;
  paused: boolean;
  reduced: boolean;
  onTogglePause: () => void;
}) {
  return (
    <div className="landing-window-wrap">
      <div className="landing-window-scroll">
        <div className="landing-window" data-step={step} role="img"
          aria-label="Example requirements table: REQ-103 collects its issue, pull request, commits, checks, and release until its evidence is complete">
          <div className="landing-window-bar">
            <div className="landing-window-crumbs">
              <Logo size={24} /><span>Acme</span><span className="is-faint">/</span><span className="is-current">billing-service</span>
            </div>
            <div className="landing-window-tools">
              <div className="landing-window-search">Search requirements</div>
              <div className="landing-avatar">MR</div>
            </div>
          </div>
          <div className="landing-window-body">
            <MockSidebar />
            <RequirementsTable step={step} />
          </div>
        </div>
      </div>
      {!reduced && (
        <div className="landing-window-controls">
          <button type="button" className="landing-ghost-button" onClick={onTogglePause}>
            {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
            {paused ? "Play animation" : "Pause animation"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Renders the product introduction and looping preview, with pause support and a finished reduced-motion state. */
function Hero({ reduced }: { reduced: boolean }) {
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (reduced || paused) return;
    const timer = window.setInterval(() => setTick(current => (current + 1) % (LAST_STEP + 1)), 600);
    return () => window.clearInterval(timer);
  }, [reduced, paused]);
  const step = reduced ? LAST_STEP : tick;

  return (
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-container">
        <h1 id="landing-title" className="landing-hero-title">Every requirement, traced to the evidence behind it.</h1>
        <div className="landing-hero-row">
          <p className="landing-hero-sub">
            SpecThread links each requirement to the issues, pull requests, commits, checks, and releases that implement it.
            A reviewer reads one thread and makes the call.
          </p>
          <div className="landing-hero-ctas">
            <Link className="landing-primary" href="/signup">Sign up free</Link>
            <a className="landing-hero-link" href="#how">How it works →</a>
          </div>
        </div>
      </div>
      <ProductWindow step={step} paused={paused} reduced={reduced} onTogglePause={() => setPaused(value => !value)} />
    </section>
  );
}

/** Explains the product purpose, intended audience, and role of human acceptance decisions. */
function About() {
  return (
    <section id="about" className="landing-section" aria-labelledby="about-title">
      <div className="landing-container">
        <div className="landing-kicker">ABOUT</div>
        <h2 id="about-title" className="landing-h2 landing-narrow">Requirements connected to the evidence that implements them.</h2>
        <p className="landing-lead">
          SpecThread connects software requirements to inspectable implementation evidence: GitHub issues,
          pull requests, commits, automated checks, and releases.
        </p>
        <div className="landing-columns">
          {ABOUT.map(item => (
            <div key={item.title} className="landing-column">
              <h3>{item.title}</h3>
              <p className="landing-body">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Renders the three steps for writing requirements, linking work, and reviewing evidence. */
function HowItWorks() {
  return (
    <section id="how" className="landing-section" aria-labelledby="how-title">
      <div className="landing-container">
        <div className="landing-kicker">HOW IT WORKS</div>
        <h2 id="how-title" className="landing-h2 landing-narrow">“Done” on a board is a status. SpecThread shows the work.</h2>
        <div className="landing-columns">
          {STEPS.map(step => (
            <div key={step.n} className="landing-column">
              <div className="landing-step-number">{step.n}</div>
              <h3>{step.title}</h3>
              <p className="landing-body">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Gathers sample artifacts into a chronological thread while visible; reduced motion shows them already gathered. */
function EvidenceThread({ reduced }: { reduced: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  const [replaying, setReplaying] = useState(false);
  const gathered = reduced || (inView && !replaying);

  /** Briefly scatters the evidence cards so they gather again when the replay delay ends. */
  const replay = () => {
    setReplaying(true);
    window.setTimeout(() => setReplaying(false), 900);
  };

  const cards = [
    ...ARTIFACTS.map((artifact, index) => {
      const [x, y, rotation] = gathered ? [index * 192, 176, 0] : artifact.scattered;
      return { ...artifact, opacity: gathered ? 1 : 0.55, transform: `translate(${x}px,${y}px) rotate(${rotation}deg)`, delay: gathered ? index * 110 : 0 };
    }),
    {
      kicker: "Board", title: "Moved to Done", meta: "Status only", date: "", color: "var(--muted)",
      opacity: gathered ? 0 : 0.55,
      transform: gathered ? "translate(500px,60px) rotate(-12deg) scale(.9)" : "translate(520px,110px) rotate(-4deg)", delay: 0,
    },
  ];

  return (
    <section id="evidence" className="landing-section" aria-labelledby="evidence-title">
      <div className="landing-container">
        <div className="landing-section-head">
          <div>
            <div className="landing-kicker">EVIDENCE THREAD</div>
            <h2 id="evidence-title" className="landing-h2">Scattered across tools. Read in one line.</h2>
          </div>
          {!reduced && (
            <button type="button" className="landing-ghost-button" onClick={replay}>
              Replay <RotateCw size={13} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="landing-thread-scroll">
          <div ref={ref} className="landing-thread-stage" data-gathered={gathered} role="img"
            aria-label="Evidence thread for REQ-103: requirement, GitHub issue, pull request, commits, checks, and release in date order">
            <div className="landing-thread-line" style={{ transform: gathered ? "scaleX(1)" : "scaleX(0)" }} />
            {cards.map(card => (
              <div key={card.kicker + card.title} className="landing-thread-card"
                style={{ transform: card.transform, opacity: card.opacity, transitionDelay: `${card.delay}ms` }}>
                <div className="landing-thread-box">
                  <div className="landing-thread-kicker">{card.kicker}</div>
                  <div className="landing-thread-title" style={{ color: card.color ?? "var(--fg)" }}>{card.title}</div>
                  <div className="landing-thread-meta">{card.meta}</div>
                </div>
                <div className="landing-thread-date" style={{ opacity: gathered ? 1 : 0 }}>{card.date}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Illustrates a human review decision after the card enters view, showing acceptance immediately under reduced motion. */
function ReviewDecision({ reduced }: { reduced: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  const [timerDone, setTimerDone] = useState(false);
  useEffect(() => {
    if (reduced || !inView) return;
    const timer = window.setTimeout(() => setTimerDone(true), 900);
    return () => {
      window.clearTimeout(timer);
      setTimerDone(false);
    };
  }, [inView, reduced]);
  const decided = reduced || (inView && timerDone);
  const statusColor = decided ? "var(--ok)" : "var(--accent)";

  return (
    <section id="review" className="landing-section" aria-labelledby="review-title">
      <div className="landing-container landing-review-grid">
        <div>
          <div className="landing-kicker">REVIEW DECISION</div>
          <h2 id="review-title" className="landing-h2">A person makes the acceptance decision.</h2>
          <p className="landing-review-copy">
            An authorized reviewer accepts, rejects, or requests more evidence. The decision is recorded with a note and a timestamp.
          </p>
          <dl className="landing-terms">
            {TERMS.map(item => (
              <div key={item.term}>
                <dt style={{ color: item.color }}>{item.term}</dt>
                <dd>{item.def}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div ref={ref} className="landing-review-card">
          <div className="landing-review-head">
            <div>
              <div className="landing-review-id">REQ-103</div>
              <div className="landing-review-title">Lock accounts after five failed logins</div>
            </div>
            <div className="landing-review-status" style={{ color: statusColor }}>
              <span className="landing-dot" style={{ background: statusColor }} />{decided ? "Accepted" : "Evidence complete"}
            </div>
          </div>
          <div className="landing-criteria">
            <div className="landing-card-label">Acceptance criteria</div>
            {CRITERIA.map(criterion => (
              <div key={criterion.text} className="landing-criterion">
                <div>{criterion.text}</div>
                <div className="landing-criterion-evidence" style={{ color: criterion.color }}>{criterion.evidence}</div>
              </div>
            ))}
          </div>
          <div className="landing-note">
            <div className="landing-card-label">Reviewer note</div>
            <div className="landing-note-box">Lockout and unlock-mail runs passed on the release candidate. Accepting for v1.5.</div>
            <div className="landing-review-actions" aria-hidden="true">
              <span className="landing-review-ghost">Reject</span>
              <span className="landing-review-ghost">Request evidence</span>
              <span className="landing-review-accept" style={{
                background: decided ? "var(--ok)" : "var(--fg)", borderColor: decided ? "var(--ok)" : "var(--fg)",
              }}>{decided ? "Accepted ✓" : "Accept"}</span>
            </div>
          </div>
          <div className="landing-review-record" style={{ height: decided ? 44 : 0 }} aria-hidden={!decided}>
            <span className="landing-dot" style={{ background: "var(--ok)" }} />Accepted by Maya Ruiz
            <span className="is-faint">·</span>
            <span className="landing-review-time">Sep 18, 14:02</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Renders the closing invitation to create an account and start a requirement thread. */
function FinalCta() {
  return (
    <section className="landing-final" aria-labelledby="final-title">
      <div className="landing-container landing-final-inner">
        <Logo size={68} />
        <h2 id="final-title">Start a thread for your next requirement.</h2>
        <p>Connect one GitHub repository. Free for small teams.</p>
        <Link className="landing-primary landing-final-button" href="/signup">Sign up</Link>
      </div>
    </section>
  );
}

/**
 * Renders the public landing page: hero with an animated product preview, then About,
 * How it works, the evidence thread, the review decision, and a final call to action.
 * Every animation shows its finished state when the visitor prefers reduced motion.
 */
export function LandingPage() {
  const reduced = usePrefersReducedMotion();

  return (
    <div className="landing">
      <Header />
      <main id="main-content" tabIndex={-1}>
        <Hero reduced={reduced} />
        <About />
        <HowItWorks />
        <EvidenceThread reduced={reduced} />
        <ReviewDecision reduced={reduced} />
        <FinalCta />
      </main>
      <footer className="landing-footer">
        <div>© 2026 SpecThread</div>
        <div className="landing-footer-links">
          <a href="https://github.com/TahubCS/SpecThread">GitHub</a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
