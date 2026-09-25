import { ScaffoldNavigation } from "./scaffold-navigation";

type ScaffoldPageProps = {
  title: string;
  description: string;
};

export function ScaffoldPage({ title, description }: ScaffoldPageProps) {
  return (
    <section className="stack" aria-labelledby="page-title">
      <p className="eyebrow">Route scaffold</p>
      <h1 id="page-title">{title}</h1>
      <p className="intro">{description}</p>
      <p className="notice">This page is planned. Product data and actions are not connected yet.</p>
      <ScaffoldNavigation />
    </section>
  );
}
