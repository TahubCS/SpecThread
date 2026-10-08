"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createInvitation, resendInvitation, revokeInvitation, type InvitationActionState } from "@/app/teams/[teamId]/invitation-actions";
import type { Invitation } from "@/lib/invitation-types";
import { TeamConfirmation } from "./team-confirmation";
import styles from "./teams.module.css";

const initial: InvitationActionState = { errors: {} };

function InvitationResult({ state }: { state: InvitationActionState }) {
  const [copiedUrl, setCopiedUrl] = useState("");
  const [copyErrorUrl, setCopyErrorUrl] = useState("");
  return <div className={styles.invitationResult}>
    {state.message && <p role={state.success ? "status" : "alert"} className={state.success ? styles.hint : styles.error}>{state.message}</p>}
    {state.url && <><label className={styles.field}>Invitation link<input readOnly value={state.url} onFocus={event => event.target.select()} /></label>
      <button type="button" className={styles.secondary} onClick={async () => {
        try { await navigator.clipboard.writeText(state.url!); setCopiedUrl(state.url!); setCopyErrorUrl(""); }
        catch { setCopyErrorUrl(state.url!); }
      }}>{copiedUrl === state.url ? "Link copied" : "Copy link"}</button>
      {copyErrorUrl === state.url && <p role="alert" className={styles.error}>Select and copy the invitation link above.</p>}</>}
  </div>;
}

export function InvitePeopleButton({ teamId, owner }: { teamId: string; owner: boolean }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={styles.secondary} onClick={() => setOpen(true)}>Invite people</button>
    {open && <InvitePeopleDialog teamId={teamId} owner={owner} close={() => setOpen(false)} />}</>;
}

function InvitePeopleDialog({ teamId, owner, close }: { teamId: string; owner: boolean; close: () => void }) {
  // Action completion also resets forms that return validation errors; retain choices until close.
  const [state, action, pending] = useActionState(createInvitation.bind(null, teamId), initial);
  const dialog = useRef<HTMLDialogElement>(null);
  const email = useRef<HTMLInputElement>(null);
  const heading = useId();
  const router = useRouter();
  useEffect(() => { dialog.current?.showModal(); email.current?.focus(); }, []);
  useEffect(() => { if (state.success) router.refresh(); }, [state, router]);
  return <dialog ref={dialog} className={`${styles.dialog} ${styles.inviteDialog}`} aria-labelledby={heading}
    onCancel={event => { if (pending) event.preventDefault(); }} onClose={close}>
    <h2 id={heading}>Invite people</h2>
    {state.success ? <><InvitationResult state={state} /><div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => dialog.current?.close()}>Done</button></div></> :
      <form action={action} className={styles.form} aria-busy={pending} onReset={event => event.preventDefault()}>
        <label className={styles.field}>Email<input ref={email} name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={state.values?.email ?? ""}
          disabled={pending} aria-invalid={Boolean(state.errors.email)} aria-describedby={state.errors.email ? `${heading}-email` : undefined} />
          {state.errors.email && <span id={`${heading}-email`} className={styles.error}>{state.errors.email.join(" ")}</span>}</label>
        <label className={styles.field}>Role<select name="role" defaultValue={state.values?.role ?? "member"} disabled={pending} aria-invalid={Boolean(state.errors.role)}>
          <option value="member">Member</option>{owner && <option value="admin">Admin</option>}</select>
          {state.errors.role && <span className={styles.error}>{state.errors.role.join(" ")}</span>}</label>
        <p className={styles.hint}>They’ll join after accepting with this verified email. The link expires in 7 days.</p>
        {state.message && <p role="alert" className={styles.error}>{state.message}</p>}
        <div className={styles.actions}><button type="button" className={styles.secondary} disabled={pending} onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className={styles.primary} disabled={pending}>{pending ? "Sending…" : "Send invitation"}</button></div>
      </form>}
  </dialog>;
}

export function InvitationRowActions({ invitation, owner }: { invitation: Invitation; owner: boolean }) {
  const [resend, resendAction, resending] = useActionState(resendInvitation.bind(null, invitation.teamId, invitation.id), initial);
  const [revoke, revokeAction, revoking] = useActionState(revokeInvitation.bind(null, invitation.teamId, invitation.id), initial);
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();
  useEffect(() => { if (resend.success) router.refresh(); }, [resend, router]);
  useEffect(() => { if (revoke.success) router.refresh(); }, [revoke, router]);
  if ((!owner && invitation.role === "admin") || ["accepted", "revoked"].includes(invitation.status)) return null;
  return <><div className={styles.actions}>
    <form action={resendAction}><button className={styles.secondary} disabled={resending || revoking}>{resending ? "Sending…" : "Resend"}</button></form>
    <button type="button" className={styles.secondary} disabled={resending || revoking} onClick={() => setConfirm(true)}>Revoke</button>
  </div><InvitationResult state={resend} />
    <TeamConfirmation open={confirm && !revoke.success} onClose={() => setConfirm(false)} title="Revoke invitation" action={revokeAction} pending={revoking}
      message={revoke.message} confirmLabel="Revoke invitation">Revoke the invitation for <strong>{invitation.email}</strong>? Their current link will stop working.</TeamConfirmation></>;
}
