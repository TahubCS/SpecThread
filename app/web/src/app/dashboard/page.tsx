import type { Metadata } from "next";
import Link from "next/link";
import { ScaffoldNavigation } from "@/components/scaffold-navigation";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="stack">
      <h1>Dashboard</h1>
      <p className="notice">Public preview. No account, projects, or repository data is connected.</p>
      <div className="dashboard-grid">
        <section className="panel stack" aria-labelledby="projects-heading">
          <h2 id="projects-heading">Projects</h2>
          <p>No projects yet.</p>
          <p className="muted">The project page is a route preview; creation is not connected yet.</p>
          <Link className="button" href="/projects/new">Create project</Link>
        </section>
        <section className="panel stack" aria-labelledby="github-heading">
          <h2 id="github-heading">GitHub connection</h2>
          <p>No repository connected.</p>
          <p className="muted">Repository setup is a route preview; connections are not available yet.</p>
          <Link className="button" href="/onboarding/repository">Connect GitHub</Link>
        </section>
      </div>
      <section className="panel" aria-labelledby="activity-heading">
        <h2 id="activity-heading">Recent activity</h2>
        <p className="muted">Requirement updates, evidence, and review decisions will appear here.</p>
      </section>
      <ScaffoldNavigation />
    </div>
  );
}
