import type { Metadata } from "next";

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
          <p id="project-status" className="muted">Project creation will be available after account setup is connected.</p>
          <button className="button" disabled aria-describedby="project-status">Create project</button>
        </section>
        <section className="panel stack" aria-labelledby="github-heading">
          <h2 id="github-heading">GitHub connection</h2>
          <p>No repository connected.</p>
          <p id="github-status" className="muted">Repository connections will be available in a later step.</p>
          <button className="button" disabled aria-describedby="github-status">Connect GitHub</button>
        </section>
      </div>
      <section className="panel" aria-labelledby="activity-heading">
        <h2 id="activity-heading">Recent activity</h2>
        <p className="muted">Requirement updates, evidence, and review decisions will appear here.</p>
      </section>
    </div>
  );
}
