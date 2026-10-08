import Link from "next/link";
import { FolderKanban } from "lucide-react";
import type { TeamProject } from "@/lib/team-projects";
import styles from "./teams.module.css";
import { RestoreProjectButton } from "./restore-project-button";

export function TeamProjectTable({ projects, teamName, archived = false, canRestore = false }: {
  projects: TeamProject[]; teamName: string; archived?: boolean; canRestore?: boolean;
}) {
  if (!projects.length) return (
    <div className={styles.empty}>
      <h2>{archived ? "No archived projects" : "No projects yet"}</h2>
      <p>{archived ? `Archived projects in ${teamName} will appear here.` : `Projects in ${teamName} will appear here.`}</p>
    </div>
  );
  return (
    <div className={styles.tableScroll}>
      <table className={`${styles.membersTable} ${styles.projectsTable}`}>
        <caption className={styles.tableCaption}>{projects.length} {archived ? "archived " : ""}{projects.length === 1 ? "project" : "projects"} in {teamName}</caption>
        <thead><tr><th scope="col">Project</th><th scope="col">Requirements</th><th scope="col">Created</th>{archived && canRestore && <th scope="col">Actions</th>}</tr></thead>
        <tbody>{projects.map(project => (
          <tr key={project.id}>
            <td><Link href={`/projects/${project.id}`} className={styles.projectName}><FolderKanban size={17} aria-hidden="true" />{project.name}</Link></td>
            <td>{project.requirementCount}</td>
            <td><time dateTime={project.createdAt}>{new Date(project.createdAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time></td>
            {archived && canRestore && <td><RestoreProjectButton project={project} /></td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
