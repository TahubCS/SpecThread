import type { Metadata } from "next";
import { ProjectForm } from "@/components/project-form";

export const metadata: Metadata = { title: "Create a project" };

/** Renders the form that creates a personal project owned by the signed-in user. */
export default function Page() {
  return (
    <section className="scaffold-page" aria-labelledby="page-title">
      <header className="scaffold-heading">
        <h1 id="page-title">Create a project</h1>
        <p>A project holds the requirements you want to trace. You will be its owner.</p>
      </header>
      <ProjectForm />
    </section>
  );
}
