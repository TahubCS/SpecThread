import Link from "next/link";
import {
  ArrowRight, CircleCheck, FileText, GitPullRequest, Github, Tag, Users,
} from "lucide-react";

const evidenceSteps = [
  { label: "Requirement", detail: "", icon: FileText, linked: true },
  { label: "Issue", detail: "#42", icon: Github, linked: true },
  { label: "PR", detail: "#87", icon: GitPullRequest, linked: true },
  { label: "Checks", detail: "", icon: CircleCheck, linked: true },
  { label: "Release", detail: "", icon: Tag, linked: false },
  { label: "Review", detail: "", icon: Users, linked: false },
] as const;

export default function Home() {
  return (
    <div className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-heading">
        <div className="landing-copy">
          <p className="landing-eyebrow">Requirements. Code. Context.</p>
          <h1 id="landing-heading">
            Follow the work behind every requirement<span className="landing-accent">.</span>
          </h1>
          <p className="landing-lede">
            Trace the issue, code, checks, release, and review in one clear thread.
          </p>
          <div className="landing-actions">
            <Link className="landing-cta" href="/signup">Get started</Link>
            <Link className="landing-secondary" href="/dashboard">
              Explore the dashboard <ArrowRight size={19} aria-hidden="true" />
            </Link>
          </div>
        </div>

        <section className="landing-demo" id="product" aria-labelledby="landing-demo-heading">
          <div className="landing-demo-header">
            <span>ST-104</span>
            <h2 id="landing-demo-heading">Invite teammates</h2>
          </div>
          <div className="landing-evidence-scroll">
            <ol className="landing-evidence" aria-label="Example evidence path for Invite teammates">
              {evidenceSteps.map(({ label, detail, icon: Icon, linked }) => (
                <li key={label} className={linked ? "is-linked" : "is-pending"}>
                  <span className="landing-evidence-icon">
                    <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  <span>{label}</span>
                  {detail && <small>{detail}</small>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      </section>
    </div>
  );
}
