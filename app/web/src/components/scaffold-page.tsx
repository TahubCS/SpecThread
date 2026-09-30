import { ScaffoldNavigation } from "./scaffold-navigation";

type ScaffoldPageProps = {
  title: string;
  description: string;
};

/** Renders a planned page within the shared product visual system. */
export function ScaffoldPage({ title, description }: ScaffoldPageProps) {
  return (
    <section className="scaffold-page" aria-labelledby="page-title">
      <header className="scaffold-heading">
        <p className="scaffold-kicker">SpecThread / Planned workspace</p>
        <h1 id="page-title">{title}</h1>
        <p>{description}</p>
      </header>
      <div className="scaffold-status" role="status">
        <span className="scaffold-status-mark" aria-hidden="true" />
        <div>
          <strong>Workspace preview</strong>
          <p>This page is planned. Product data and actions are not connected yet.</p>
        </div>
      </div>
      <ScaffoldNavigation />
    </section>
  );
}
