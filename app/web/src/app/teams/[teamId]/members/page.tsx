import { getTeam, getTeamMembers, requireTeamSession } from "@/lib/teams";
import { TeamMembersTable } from "@/components/teams/team-members-table";
import styles from "@/components/teams/teams.module.css";
import Link from "next/link";
import { InvitePeopleButton } from "@/components/teams/invitation-controls";

export default async function Page({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeam(teamId);
  const session = await requireTeamSession(`/teams/${teamId}/members`);
  const members = await getTeamMembers(teamId);
  return <div className={styles.sectionContent}><div className={styles.header}><h1>Members</h1>
    {team.role !== "member" && <div className={styles.actions}><InvitePeopleButton teamId={teamId} owner={team.role === "owner"} />
      <Link className={styles.secondary} href={`/teams/${teamId}/invitations`}>View invitations</Link></div>}</div>
    <TeamMembersTable members={members} team={team} callerId={session.user.id} /></div>;
}
