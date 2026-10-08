import { getTeam, getTeamMembers } from "@/lib/teams";
import { teamRoleLabels } from "@/lib/team-types";
import styles from "@/components/teams/teams.module.css";

export default async function Page({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  await getTeam(teamId);
  const members = await getTeamMembers(teamId);
  return <div className={styles.sectionContent}><h1>Members</h1>
    <div className={styles.tableScroll}><table className={styles.membersTable}>
      <caption className={styles.tableCaption}>Team members</caption>
      <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Joined</th></tr></thead>
      <tbody>{members.map(member => <tr key={member.userId}><td>{member.name}</td><td>{member.email}</td><td>{teamRoleLabels[member.role]}</td>
        <td><time dateTime={member.joinedAt}>{new Date(member.joinedAt).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</time></td></tr>)}</tbody>
    </table></div></div>;
}
