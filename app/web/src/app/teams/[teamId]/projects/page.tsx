import Link from "next/link";
import { getTeamProjects } from "@/lib/team-projects";
import { getTeam } from "@/lib/teams";
import { TeamProjectTable } from "@/components/teams/team-project-table";
import styles from "@/components/teams/teams.module.css";

export default async function Page({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeam(teamId);
  const projects = await getTeamProjects(teamId);
  return (
    <div className={styles.sectionContent}>
      <header className={styles.header}>
        <h1>Projects</h1>
        {team.role !== "member" && <Link href={`/projects/new?team=${teamId}`} className={styles.secondary}>New project</Link>}
        <Link href={`/teams/${teamId}/archive`} className={styles.secondary}>Open archive</Link>
      </header>
      <TeamProjectTable projects={projects} teamName={team.name} />
    </div>
  );
}
