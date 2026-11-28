import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { RefreshReleaseButton } from "@/components/release-controls";
import { listMembers, requireProject, requireRelease } from "@/lib/project-data";
import { canEditProject, formatDate, formatDateTime } from "@/lib/projects";
import { formatDeployedOn, includedText } from "@/lib/releases";

type Props = PageProps<"/projects/[projectId]/releases/[releaseId]">;

/** Comparing a release again reads GitHub for up to a minute (ADR-048). */
export const maxDuration = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectId, releaseId } = await params;
  const release = await requireRelease(projectId, releaseId);
  return { title: `${release.tag} on ${release.environment}` };
}

const external = { target: "_blank", rel: "noreferrer" } as const;

/**
 * One recorded release (ADR-066): GitHub's release, the environment and date it was deployed, who
 * recorded it and when, and the requirements whose linked commits and pull requests its history
 * contains, with those changes.
 */
export default async function Page({ params }: Props) {
  const { projectId, releaseId } = await params;
  const [project, release, members] = await Promise.all([requireProject(projectId), requireRelease(projectId, releaseId), listMembers(projectId)]);
  const people = Object.fromEntries(members.map(member => [member.userId, member.name]));

  return (
    <article className="project-page is-form" aria-labelledby="page-title">
      <Link className="back-link" href={`/projects/${project.id}/releases`}><ArrowLeft size={15} aria-hidden="true" /> Releases</Link>
      <header className="project-page-heading">
        <h1 id="page-title">{release.tag} on {release.environment}</h1>
        {release.prerelease && <span className="badge">Pre-release</span>}
      </header>
      <dl className="release-details">
        <dt>Release</dt>
        <dd><a href={release.url} {...external}>{release.name}<span className="sr-only"> (opens GitHub in a new tab)</span></a></dd>
        <dt>Environment</dt>
        <dd>{release.environment}</dd>
        <dt>Deployed on</dt>
        <dd>{formatDeployedOn(release.deployedOn)}</dd>
        <dt>Published on GitHub</dt>
        <dd>
          <time dateTime={release.publishedAt}>{formatDate(release.publishedAt)}</time>
          {release.author ? ` by ${release.author}` : ""} · commit <span className="evidence-number">{release.sha.slice(0, 7)}</span>
        </dd>
        <dt>Recorded by</dt>
        <dd>{people[release.recordedBy] ?? "a former member"} on <time dateTime={release.recordedAt}>{formatDateTime(release.recordedAt)}</time></dd>
      </dl>
      <section className="requirement-section" aria-labelledby="included-heading">
        <h2 id="included-heading">{includedText(release)}</h2>
        {release.requirements.length === 0 ? (
          <p className="muted">None of the project&apos;s linked commits or merged pull requests are in this release&apos;s history.</p>
        ) : (
          <ul className="row-list" aria-label="Included requirements">
            {release.requirements.map(requirement => (
              <li key={requirement.id}>
                <Link className="row" href={`/projects/${project.id}/requirements/${requirement.id}`}>
                  <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span className="row-title">{requirement.title}</span>
                  {requirement.archivedAt && <span className="badge">Archived</span>}
                  <span className="row-meta">{requirement.changes.map(change => change.label).join(", ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="muted release-note">
          Compared {release.compared === 1 ? "1 linked change" : `${release.compared} linked changes`} with GitHub on{" "}
          <time dateTime={release.comparedAt}>{formatDateTime(release.comparedAt)}</time>. Included means the change is in the history of
          the release&apos;s tag.
        </p>
        {canEditProject(project) && !project.archivedAt && <RefreshReleaseButton projectId={project.id} releaseId={release.id} />}
      </section>
    </article>
  );
}
