import { getTeam, getTeamMembers } from "@/lib/teams";
import { TeamSettingsForm, TeamOwnershipForm } from "@/components/teams/team-settings-form";
import { LeaveTeamButton } from "@/components/teams/leave-team-button";
import styles from "@/components/teams/teams.module.css";

export default async function Page({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeam(teamId);
  const members = await getTeamMembers(teamId);
  const owner = members.find(member => member.role === "owner");
  return <div className={`${styles.sectionContent} ${styles.page}`}>
    <header className={styles.header}><h1>Team settings</h1></header>
    {team.role === "member" ? <section className={styles.settingsSection}>
      <h2>General</h2><p className={styles.hint}>The Owner and Admins manage these details.</p>
      <dl className={styles.readOnlySettings}><dt>Team name</dt><dd>{team.name}</dd><dt>Description</dt><dd>{team.description || "No description"}</dd></dl>
    </section> : <TeamSettingsForm team={team} />}
    <section id="ownership" className={styles.settingsSection}>
      <h2>Ownership</h2><p className={styles.hint}>{owner?.name || "The team Owner"} owns this team.</p>
      {team.role === "owner" ? <TeamOwnershipForm team={team} members={members} /> : <p className={styles.hint}>Only the Owner can transfer ownership.</p>}
    </section>
    <section id="leave-team" className={styles.settingsSection}>
      <h2>Leave team</h2><p className={styles.hint}>Leaving removes your access to this team and all its projects.</p>
      {team.role === "owner" && <p className={styles.hint}>Transfer ownership before leaving.</p>}
      <LeaveTeamButton team={team} />
    </section>
  </div>;
}
