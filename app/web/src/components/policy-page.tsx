import type { ReactNode } from "react";

/**
 * Renders a public policy page, shown with the minimal public header and never the app sidebar.
 * `children` holds the sections already published; the draft notice covers the rest.
 */
export function PolicyPage({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <section className="scaffold-page" aria-labelledby="page-title">
      <header className="scaffold-heading">
        <p className="scaffold-kicker">SpecThread / Policy</p>
        <h1 id="page-title">{title}</h1>
        <p>{description}</p>
      </header>
      <div className="scaffold-status" role="status">
        <span className="scaffold-status-mark" aria-hidden="true" />
        <div>
          <strong>Draft</strong>
          <p>This page is planned. The full text is not published yet.</p>
        </div>
      </div>
      {children}
    </section>
  );
}
