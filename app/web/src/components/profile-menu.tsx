"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { initialsOf } from "@/lib/app-navigation";

/**
 * Renders the workspace profile button and its menu, which links the workspace to settings.
 * Signed-in users see Settings, Account, and Log out; signed-out users see Settings, Log in,
 * and Sign up; only Settings shows while the session loads. A failed log out keeps the menu
 * open with an error. Parents key this component by pathname so it closes after navigation.
 */
export function ProfileMenu() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = session ? session.user.name.trim() || session.user.email : "SpecThread";

  async function logOut() {
    setBusy(true);
    setError(null);
    let failed: boolean;
    try {
      failed = Boolean((await authClient.signOut()).error);
    } catch {
      failed = true;
    }
    if (failed) {
      setError("Unable to log out. Please try again.");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <details className="app-profile-menu">
      <summary className="app-brand" aria-label={`Profile menu, ${name}`}>
        {session
          ? <span className="app-avatar" aria-hidden="true">{initialsOf(session.user.name, session.user.email)}</span>
          : <Image src="/thread-mark.png" alt="" width={39} height={22} loading="eager" unoptimized aria-hidden="true" />}
        <span className="app-profile-name">{name}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="app-profile-options">
        <Link href="/settings">Settings</Link>
        {!isPending && (session ? (
          <>
            <Link href="/settings/account">Account</Link>
            <hr />
            <button type="button" onClick={logOut} disabled={busy}>{busy ? "Logging out..." : "Log out"}</button>
          </>
        ) : (
          <>
            <Link href="/login">Log in</Link>
            <Link href="/signup">Sign up</Link>
          </>
        ))}
        {error && <p role="alert" className="app-profile-error">{error}</p>}
      </div>
    </details>
  );
}
