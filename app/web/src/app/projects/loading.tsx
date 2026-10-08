/** Shown while a project page waits for the API, which can take a while to wake up. */
export default function Loading() {
  return (
    <section className="scaffold-page">
      <p className="notice" role="status">Loading...</p>
    </section>
  );
}
