import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Lock } from "lucide-react";
import { RepositoryDisconnect, RepositoryPicker } from "@/components/repository-connect";
import { getProjectRepository, gitHubAccess, listAvailableRepositories } from "@/lib/github-data";
import { listMembers, requireProject, viewerId } from "@/lib/project-data";
import { formatDate, type Project } from "@/lib/projects";

export const metadata: Metadata = { title: "Repository" };

const external = { target: "_blank", rel: "noreferrer" } as const;

/**
 * Shows the GitHub repository a project reads evidence from. The owner connects one that
 * GitHub says they can reach through the SpecThread app, or disconnects it.
 */
export default async function Page({ params }: PageProps<"/projects/[projectId]/settings/repository">) {
  const project = await requireProject((await params).projectId);
  const [repository, members, viewer] = await Promise.all([getProjectRepository(project.id), listMembers(project.id), viewerId()]);
  const canChange = project.ownerUserId === viewer && !project.archivedAt;

  return (
    <section className="project-page is-form" aria-labelledby="page-title">
      <Link className="back-link" href={`/projects/${project.id}/settings`}><ArrowLeft size={15} aria-hidden="true" /> Settings</Link>
      <header className="project-page-heading">
        <h1 id="page-title">Repository</h1>
      </header>
      {repository ? (
        <>
          <div className="side-card repository-card">
            <a className="repository-name" href={repository.url} {...external}>
              {repository.fullName} <ExternalLink size={14} aria-hidden="true" /><span className="sr-only">(opens GitHub in a new tab)</span>
            </a>
            {repository.isPrivate && <span className="badge"><Lock size={11} aria-hidden="true" /> Private</span>}
            <p>
              Connected by {members.find(member => member.userId === repository.connectedBy)?.name ?? "a former member"} on{" "}
              <time dateTime={repository.connectedAt}>{formatDate(repository.connectedAt)}</time>
            </p>
          </div>
          {canChange && <RepositoryDisconnect projectId={project.id} fullName={repository.fullName} />}
        </>
      ) : canChange ? <Connect project={project} /> : (
        <p className="notice">
          {project.archivedAt
            ? "No repository is connected, and this project is archived."
            : "No repository is connected. Only the project owner can connect one."}
        </p>
      )}
    </section>
  );
}

/** Renders the owner's path to connecting: link GitHub, install the app, then choose a repository. */
async function Connect({ project }: { project: Project }) {
  const account = <Link href="/settings/account">your account page</Link>;
  const access = await gitHubAccess();
  if (access.token === null) {
    return (
      <p className="notice">
        {access.reason === "not-linked"
          ? <>Connecting a repository uses your GitHub account. Link GitHub on {account}, then come back here.</>
          : <>Your GitHub sign-in has expired. Sign in with GitHub again from {account}, then come back here.</>}
      </p>
    );
  }

  const listing = await listAvailableRepositories(access.token);
  const retry = <Link href={`/projects/${project.id}/settings/repository`}>Try again</Link>;
  if (listing.status === "token-rejected") {
    return <p className="notice">GitHub did not accept your GitHub sign-in. Sign in with GitHub again from {account}, then come back here.</p>;
  }
  if (listing.status === "not-configured") return <p className="notice">GitHub is not set up for this SpecThread deployment yet.</p>;
  if (listing.status === "unavailable") return <p className="notice">GitHub could not be reached. {retry}</p>;

  const { installUrl, repositories, truncated } = listing.list;
  const install = installUrl && (
    <a href={installUrl} {...external}>install the SpecThread app on GitHub<span className="sr-only"> (opens in a new tab)</span></a>
  );
  return (
    <>
      <p className="repository-help">
        {repositories.length === 0
          ? <>The SpecThread app is not installed on any repository you can access. {install ? <>First {install}, then </> : "After it is installed, "}</>
          : <>These are the repositories the SpecThread app can read for you. To add another, {install ?? "install the app on it"}, then </>}
        <Link href={`/projects/${project.id}/settings/repository`}>reload this list</Link>.
      </p>
      {truncated && <p className="notice">Only the first repositories are shown. Limit the app to fewer repositories on GitHub to find the one you need.</p>}
      {repositories.length > 0 && <RepositoryPicker projectId={project.id} repositories={repositories} />}
    </>
  );
}
