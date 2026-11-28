import type { Metadata } from "next";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { RecordReleaseForm } from "@/components/release-controls";
import { getProjectRepository } from "@/lib/github-data";
import { listMembers, listReleases, requireProject } from "@/lib/project-data";
import { canEditProject, formatDateTime } from "@/lib/projects";
import { formatDeployedOn, includedText } from "@/lib/releases";

export const metadata: Metadata = { title: "Releases" };

/** Recording a release reads GitHub for up to a minute (ADR-048). */
export const maxDuration = 60;

/**
 * The project's recorded releases (ADR-066, US-13): each published release of the connected
 * repository that reached an environment, newest deployment first, with the date, who recorded
 * it, and how many requirements it includes. Owners, Admins, and Members record one here.
 */
export default async function Page({ params }: PageProps<"/projects/[projectId]/releases">) {
  const { projectId } = await params;
  const project = await requireProject(projectId);
  const [releases, members, repository] = await Promise.all([listReleases(project.id), listMembers(project.id), getProjectRepository(project.id)]);
  const people = Object.fromEntries(members.map(member => [member.userId, member.name]));
  const canRecord = canEditProject(project) && !project.archivedAt && repository !== null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <article className="project-page is-form" aria-labelledby="page-title">
      <header className="project-page-heading">
        <h1 id="page-title">Releases</h1>
      </header>
      <p className="requirement-meta">
        A release records which published GitHub release reached an environment, and when. SpecThread asks GitHub which linked
        commits and pull requests it contains, so each requirement shows where it was deployed.
      </p>
      {releases === null ? (
        <p className="notice" role="status">Releases can&apos;t be shown right now. Try again in a few minutes.</p>
      ) : (
        <section className="requirement-section" aria-labelledby="releases-heading">
          <h2 id="releases-heading">Recorded releases</h2>
          {releases.length === 0 ? (
            <p className="muted">No releases have been recorded yet.</p>
          ) : (
            <ul className="row-list" aria-label="Recorded releases">
              {releases.map(release => (
                <li key={release.id}>
                  <Link className="row release-row" href={`/projects/${project.id}/releases/${release.id}`}>
                    <Rocket size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span className="row-title">{release.tag}{release.name !== release.tag ? ` · ${release.name}` : ""}</span>
                    <span className="badge">{release.environment}</span>
                    <span className="row-meta">
                      Deployed {formatDeployedOn(release.deployedOn)} · {includedText(release)} · Recorded by{" "}
                      {people[release.recordedBy] ?? "a former member"} on <time dateTime={release.recordedAt}>{formatDateTime(release.recordedAt)}</time>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className="requirement-section" aria-labelledby="record-heading">
        <h2 id="record-heading">Record a release</h2>
        {canRecord && repository ? (
          <RecordReleaseForm projectId={project.id} repository={repository.fullName} today={today} />
        ) : project.archivedAt ? (
          <p className="muted">This project is archived, so no release can be recorded.</p>
        ) : !canEditProject(project) ? (
          <p className="muted">Your role on this team can read releases but not record them.</p>
        ) : (
          <p className="muted">
            Connect a GitHub repository in <Link href={`/projects/${project.id}/settings/repository`}>project settings</Link> to record releases.
          </p>
        )}
      </section>
    </article>
  );
}
