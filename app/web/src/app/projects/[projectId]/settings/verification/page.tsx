import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RemoveVerification, VerificationSettingsForm } from "@/components/verification";
import { getProjectRepository } from "@/lib/github-data";
import { getVerificationSettings, listMembers, requireProject } from "@/lib/project-data";
import { canManageProject, formatDate } from "@/lib/projects";
import { VERIFICATION_WORKFLOW_TEMPLATE } from "@/lib/verification";

export const metadata: Metadata = { title: "Verification settings" };

/** Saving reads GitHub to confirm the workflow exists (ADR-048). */
export const maxDuration = 60;

/**
 * The project's predefined verification (ADR-070, US-15): the one GitHub Actions workflow and
 * branch that members can run for a requirement. The team's Owner or an Admin sets it up; every
 * member reads it. A template workflow that runs a predefined Playwright scenario is shown.
 */
export default async function Page({ params }: PageProps<"/projects/[projectId]/settings/verification">) {
  const { projectId } = await params;
  const project = await requireProject(projectId);
  const [settings, repository, members] = await Promise.all([getVerificationSettings(project.id), getProjectRepository(project.id), listMembers(project.id)]);
  const canChange = canManageProject(project) && !project.archivedAt;
  const nameOf = (userId: string) => members.find(member => member.userId === userId)?.name ?? "a former member";

  return (
    <section className="project-page is-form" aria-labelledby="page-title">
      <Link className="back-link" href={`/projects/${project.id}/settings`}><ArrowLeft size={15} aria-hidden="true" /> Settings</Link>
      <header className="project-page-heading">
        <h1 id="page-title">Verification</h1>
      </header>
      <p className="requirement-meta">
        A verification is one GitHub Actions workflow that runs the project&apos;s predefined Playwright scenario. Members start it from a
        requirement, and its result, times, and log are kept there as evidence. Nothing else can be run.
      </p>
      {settings === null ? (
        <p className="notice" role="status">Verification settings can&apos;t be shown right now. Try again in a few minutes.</p>
      ) : (
        <>
          {settings.configured && (
            <div className="side-card repository-card">
              <p><strong>{settings.workflow}</strong> on <strong>{settings.branch}</strong></p>
              <p>Set up by {nameOf(settings.configuredBy!)} on <time dateTime={settings.configuredAt!}>{formatDate(settings.configuredAt!)}</time></p>
              {!settings.current && <p className="notice">This was set up for a repository that is no longer connected. Set it up again.</p>}
            </div>
          )}
          {!repository ? (
            <p className="muted">
              Connect a GitHub repository in <Link href={`/projects/${project.id}/settings/repository`}>repository settings</Link> first.
            </p>
          ) : canChange ? (
            <>
              <VerificationSettingsForm projectId={project.id} repository={repository.fullName}
                workflow={settings.workflow ?? "specthread-verification.yml"} branch={settings.branch ?? "main"} />
              {settings.configured && <RemoveVerification projectId={project.id} />}
            </>
          ) : (
            <p className="notice">
              {project.archivedAt ? "This project is archived and can no longer be changed." : "Only the team Owner or an Admin can set up the verification."}
            </p>
          )}
        </>
      )}
      <details className="verification-template">
        <summary>A workflow to start from</summary>
        <p className="muted">
          Save it as .github/workflows/specthread-verification.yml and point the test path at the project&apos;s verification scenario. It must
          accept the specthread_run input and put it in the run name, as this one does. The SpecThread GitHub App needs the Actions
          permission (read and write) on the repository.
        </p>
        <pre><code>{VERIFICATION_WORKFLOW_TEMPLATE}</code></pre>
      </details>
    </section>
  );
}
