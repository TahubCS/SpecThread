import Link from "next/link";
import { getTeamProjects } from "@/lib/team-projects";
import { getTeam } from "@/lib/teams";
import { TeamProjectTable } from "@/components/teams/team-project-table";
import styles from "@/components/teams/teams.module.css";

export default async function Page({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeam(teamId);
  const projects = await getTeamProjects(teamId, true);
  return (
    <div className={styles.sectionContent}>
      <header className={styles.header}>
        <h1>Archived projects</h1>
        <Link href={`/teams/${teamId}/projects`} className={styles.secondary}>Back to projects</Link>
      </header>
      <TeamProjectTable projects={projects} teamName={team.name} archived canRestore={team.role !== "member"} />
    </div>
  );
}
