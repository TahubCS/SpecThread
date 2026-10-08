import type { Metadata } from "next";
import { initialsOf } from "@/lib/app-navigation";
import { listMembers, requireProject } from "@/lib/project-data";
import { formatDate } from "@/lib/projects";

export const metadata: Metadata = { title: "Members" };

/** Lists a project's members with the owner first, as the API returns them. */
export default async function Page({ params }: PageProps<"/projects/[projectId]/members">) {
  const { projectId } = await params;
  await requireProject(projectId);
  const members = await listMembers(projectId);

  return (
    <section className="project-page" aria-labelledby="page-title">
      <header className="project-page-heading">
        <h1 id="page-title">Members</h1>
        <span className="count">{members.length}</span>
      </header>
      <ul className="row-list" aria-label="Members">
        {members.map(member => (
          <li key={member.userId} className="row">
            <span className="app-avatar" aria-hidden="true">{initialsOf(member.name, member.email)}</span>
            <span className="row-title">{member.name}</span>
            <span className="row-detail">{member.email}</span>
            <span className="badge">{member.isOwner ? "Owner" : "Member"}</span>
            <time className="row-meta" dateTime={member.joinedAt}>Joined {formatDate(member.joinedAt)}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}
