"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { LogOut } from "lucide-react";
import { leaveTeam } from "@/app/teams/[teamId]/actions";
import type { Team } from "@/lib/team-types";
import { TeamConfirmation } from "./team-confirmation";
import styles from "./teams.module.css";

export function LeaveTeamButton({ team }: { team: Team }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={styles.danger} onClick={() => setOpen(true)}><LogOut size={17} aria-hidden="true" />Leave team…</button>
    <LeaveTeamDialog team={team} open={open} onClose={() => setOpen(false)} />
  </>;
}

export function LeaveTeamDialog({ team, open, onClose }: { team: Team; open: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState(leaveTeam.bind(null, team.id), { errors: {} });
  return <TeamConfirmation open={open} onClose={onClose} title={`Leave ${team.name}?`}
    action={action} pending={pending} message={state.message} confirmLabel="Leave team" blocked={team.role === "owner"}>
    {team.role === "owner" ? <><p>You own this team. Transfer ownership before leaving.</p><Link className={styles.transferLink} href={`/teams/${team.id}/settings#ownership`} onClick={onClose}>Go to ownership transfer</Link></> :
      <p>You’ll lose access to {team.name} and all its projects and requirements. Rejoining requires an invitation.</p>}
  </TeamConfirmation>;
}
