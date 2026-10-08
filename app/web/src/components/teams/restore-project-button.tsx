"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { restoreTeamProject } from "@/app/teams/[teamId]/archive/actions";
import type { TeamProject } from "@/lib/team-projects";
import { TeamConfirmation } from "./team-confirmation";
import styles from "./teams.module.css";

export function RestoreProjectButton({ project }: { project: TeamProject }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(restoreTeamProject.bind(null, project.teamId, project.id), { errors: {} });
  const router = useRouter();
  useEffect(() => { if (state.success) router.refresh(); }, [state, router]);
  return <><button className={styles.secondary} type="button" onClick={() => setOpen(true)}>Restore</button>
    <TeamConfirmation open={open && !state.success} onClose={() => setOpen(false)} title={`Restore ${project.name}?`} action={action}
      pending={pending} message={state.message} confirmLabel="Restore project" tone="primary">
      <p>Restore <strong>{project.name}</strong> in <strong>{project.teamName}</strong>? It will return to the team’s active projects, and members can edit its requirements again.</p>
    </TeamConfirmation></>;
}
