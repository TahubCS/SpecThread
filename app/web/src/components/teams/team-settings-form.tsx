"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveTeamSettings, transferTeamOwnership } from "@/app/teams/[teamId]/actions";
import type { Team, TeamMember } from "@/lib/team-types";
import { TeamConfirmation } from "./team-confirmation";
import styles from "./teams.module.css";

export function TeamSettingsForm({ team }: { team: Team }) {
  const [state, action, pending] = useActionState(saveTeamSettings.bind(null, team.id), {
    values: { name: team.name, description: team.description }, errors: {},
  });
  useEffect(() => { if (state.success) window.dispatchEvent(new Event("specthread:teams-changed")); }, [state]);
  return <form className={styles.form} action={action} aria-busy={pending}>
    <label className={styles.field} htmlFor="settings-name"><span>Team name</span>
      <input id="settings-name" name="name" required maxLength={200} defaultValue={state.values.name}
        aria-invalid={!!state.errors.name} aria-describedby={state.errors.name ? "settings-name-error" : undefined} />
      {state.errors.name && <span className={styles.error} id="settings-name-error">{state.errors.name.join(" ")}</span>}
    </label>
    <label className={styles.field} htmlFor="settings-description"><span>Description <span className={styles.hint}>(optional)</span></span>
      <textarea id="settings-description" name="description" maxLength={10_000} defaultValue={state.values.description}
        aria-invalid={!!state.errors.description} aria-describedby={state.errors.description ? "settings-description-error" : undefined} />
      {state.errors.description && <span className={styles.error} id="settings-description-error">{state.errors.description.join(" ")}</span>}
    </label>
    {state.message && <p className={styles.error} role="alert">{state.message}</p>}
    {state.success && <p role="status" className={styles.hint}>Team details saved.</p>}
    <div className={styles.actions}><button className={styles.primary} type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button></div>
  </form>;
}

export function TeamOwnershipForm({ team, members }: { team: Team; members: TeamMember[] }) {
  const router = useRouter();
  const candidates = members.filter(member => member.role !== "owner");
  const [targetId, setTargetId] = useState("");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(transferTeamOwnership.bind(null, team.id, targetId), { errors: {} });
  const target = candidates.find(member => member.userId === targetId);
  useEffect(() => {
    if (state.success) { window.dispatchEvent(new Event("specthread:teams-changed")); router.refresh(); }
  }, [state.success, router]);
  if (!candidates.length) return <p className={styles.hint}>Ownership can be transferred once another person joins the team.</p>;
  return <div className={styles.form}>
    <label className={styles.field} htmlFor="ownership-recipient"><span>New Owner</span>
      <select id="ownership-recipient" value={targetId} onChange={event => setTargetId(event.target.value)} disabled={pending}>
        <option value="">Choose a team member</option>
        {candidates.map(member => <option key={member.userId} value={member.userId}>{member.name} ({member.email})</option>)}
      </select>
    </label>
    <div><button type="button" className={styles.secondary} disabled={!target || pending} onClick={() => setOpen(true)}>Transfer ownership</button></div>
    <TeamConfirmation open={open} onClose={() => setOpen(false)} title={`Transfer ownership of ${team.name}?`}
      action={action} pending={pending} message={state.message} confirmLabel="Transfer ownership" blocked={!target}>
      <p>{target?.name} ({target?.email}) will become the Owner of {team.name}. You’ll become an Admin. Only the new Owner can transfer ownership or appoint Admins.</p>
    </TeamConfirmation>
  </div>;
}
