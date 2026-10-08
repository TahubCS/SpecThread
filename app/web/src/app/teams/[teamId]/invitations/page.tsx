import Link from "next/link";
import { getTeam } from "@/lib/teams";
import { getTeamInvitations } from "@/lib/invitations";
import { InvitationRowActions, InvitePeopleButton } from "@/components/teams/invitation-controls";
import styles from "@/components/teams/teams.module.css";

export default async function Page({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeam(teamId);
  const invitations = await getTeamInvitations(teamId);
  return <div className={styles.sectionContent}>
    <Link className={styles.back} href={`/teams/${teamId}/members`}>← Back to Members</Link>
    <div className={styles.header}><h1>Invitations</h1><InvitePeopleButton teamId={teamId} owner={team.role === "owner"} /></div>
    {invitations.length ? <div className={styles.tableScroll}><table className={`${styles.membersTable} ${styles.invitationsTable}`}>
      <caption className={styles.tableCaption}>Invitations to {team.name}</caption>
      <thead><tr><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Inviter</th><th scope="col">Expires</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
      <tbody>{invitations.map(invitation => <tr key={invitation.id}><td>{invitation.email}</td><td>{invitation.role === "admin" ? "Admin" : "Member"}</td><td>{invitation.inviterName}</td>
        <td><time dateTime={invitation.expiresAt}>{new Date(invitation.expiresAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time></td>
        <td>{invitation.status[0].toUpperCase() + invitation.status.slice(1)}</td><td><InvitationRowActions invitation={invitation} owner={team.role === "owner"} /></td></tr>)}</tbody>
    </table></div> : <div className={styles.empty}><h2>No invitations yet</h2><p>Invite someone from Members. They’ll join after accepting their invitation.</p></div>}
  </div>;
}
