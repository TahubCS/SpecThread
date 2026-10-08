/** Shown inside the project frame while one of its sections loads, so the breadcrumb and tabs stay in place. */
export default function Loading() {
  return (
    <section className="project-page">
      <p className="page-loading" role="status">Loading...</p>
    </section>
  );
}
