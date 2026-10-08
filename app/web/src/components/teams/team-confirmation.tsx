"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./teams.module.css";

/** Native modal supplies focus containment, Escape, and restoration to the trigger. */
export function TeamConfirmation({ open, onClose, title, children, action, pending, message, confirmLabel, blocked = false, tone = "danger" }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
  action: (form: FormData) => void; pending: boolean; message?: string; confirmLabel: string; blocked?: boolean; tone?: "danger" | "primary";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const heading = useId();
  const description = useId();
  useEffect(() => {
    const element = dialog.current;
    if (open && !element?.open) { element?.showModal(); cancel.current?.focus(); }
    else if (!open && element?.open) element.close();
  }, [open]);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={heading} aria-describedby={description}
    onCancel={event => { if (pending) event.preventDefault(); }} onClose={onClose}>
    <h2 id={heading}>{title}</h2>
    <div id={description} className={styles.description}>{children}</div>
    <form action={action} aria-busy={pending}>
      {message && <p className={styles.error} role="alert">{message}</p>}
      <div className={styles.actions}>
        <button ref={cancel} type="button" className={styles.secondary} disabled={pending} onClick={() => dialog.current?.close()}>Cancel</button>
        <button type="submit" className={styles[tone]} disabled={pending || blocked}>{pending ? "Saving…" : confirmLabel}</button>
      </div>
    </form>
  </dialog>;
}
