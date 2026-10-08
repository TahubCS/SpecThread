"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveMemberRole, removeTeamMember } from "@/app/teams/[teamId]/actions";
import { teamRoleLabels, type Team, type TeamMember } from "@/lib/team-types";
import { initialsOf } from "@/lib/app-navigation";
import { TeamConfirmation } from "./team-confirmation";
import styles from "./teams.module.css";

export function TeamMembersTable({ members, team, callerId }: { members: TeamMember[]; team: Team; callerId: string }) {
  const managing = team.role !== "member";
  return <div className={styles.tableScroll}><table className={styles.membersTable}>
    <caption className={styles.tableCaption}>Team members</caption>
    <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Joined</th>{managing && <th scope="col">Actions</th>}</tr></thead>
    <tbody>{members.map(member => <MemberRow key={`${member.userId}:${member.role}`} member={member} team={team} callerId={callerId} />)}</tbody>
  </table></div>;
}

function MemberRow({ member, team, callerId }: { member: TeamMember; team: Team; callerId: string }) {
  const router = useRouter();
  const [role, setRole] = useState(member.role);
  const [open, setOpen] = useState(false);
  const [saved, save, saving] = useActionState(saveMemberRole.bind(null, team.id, member.userId), { errors: {} });
  const [removed, remove, removing] = useActionState(removeTeamMember.bind(null, team.id, member.userId), { errors: {} });
  const canChangeRole = team.role === "owner" && member.role !== "owner";
  const canRemove = member.userId !== callerId && member.role !== "owner" &&
    (team.role === "owner" || team.role === "admin" && member.role === "member");
  useEffect(() => {
    if (saved.success || removed.success) {
      window.dispatchEvent(new Event("specthread:teams-changed"));
      router.refresh();
    }
  }, [saved.success, removed.success, router]);
  return <tr>
    <td><span className={styles.memberName}><span className={styles.memberAvatar} aria-hidden="true">{initialsOf(member.name, member.email)}</span>{member.name}</span></td>
    <td>{member.email}</td>
    <td>{canChangeRole ? <form action={save} className={styles.roleForm} aria-busy={saving} onReset={event => event.preventDefault()}>
      <select name="role" aria-label={`Role for ${member.name}`} value={role} onChange={event => setRole(event.target.value as "admin" | "member")} disabled={saving}>
        <option value="member">Member</option><option value="admin">Admin</option>
      </select>
      <button className={styles.secondary} type="submit" disabled={saving || role === member.role}>{saving ? "Saving…" : "Save"}</button>
      {saved.message && <span className={styles.error} role="alert">{saved.message}</span>}
    </form> : teamRoleLabels[member.role]}</td>
    <td><time dateTime={member.joinedAt}>{new Date(member.joinedAt).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</time></td>
    {team.role !== "member" && <td>{canRemove && <>
      <button type="button" className={styles.secondary} aria-label={`Remove ${member.name}`} onClick={() => setOpen(true)}>Remove</button>
      <TeamConfirmation open={open} onClose={() => setOpen(false)} title={`Remove ${member.name}?`}
        action={remove} pending={removing} message={removed.message} confirmLabel="Remove member">
        <p>{member.name} ({member.email}) will lose access to {team.name} and all its projects and requirements. Rejoining requires an invitation.</p>
      </TeamConfirmation>
    </>}</td>}
  </tr>;
}
