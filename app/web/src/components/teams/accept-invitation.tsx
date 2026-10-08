"use client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitation } from "@/app/invites/[token]/actions";
import { authClient } from "@/lib/auth-client";
import styles from "./teams.module.css";

export function AcceptInvitation({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitation.bind(null, token), {});
  return <form action={action} className={styles.form} aria-busy={pending}>
    {state.message && <p className={styles.error} role="alert">{state.message}</p>}
    <button className={styles.primary} disabled={pending}>{pending ? "Joining…" : "Accept invitation"}</button>
  </form>;
}

export function InvitationSwitchAccount({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  return <><button type="button" className={styles.secondary} disabled={pending} onClick={async () => {
    setPending(true); setMessage("");
    try {
      if ((await authClient.signOut()).error) { setMessage("Unable to sign out. Please try again."); return; }
      router.replace(`/login?next=${encodeURIComponent(`/invites/${token}`)}`); router.refresh();
    } catch { setMessage("Unable to sign out. Please try again."); }
    finally { setPending(false); }
  }}>{pending ? "Signing out…" : "Use another account"}</button>
    {message && <p role="alert" className={styles.error}>{message}</p>}</>;
}
