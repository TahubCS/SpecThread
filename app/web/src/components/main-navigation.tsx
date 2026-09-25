"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function MainNavigation() {
  const { data: session, isPending } = authClient.useSession();

  return (
    <nav aria-label="Main navigation">
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/teams">Teams</Link>
      <Link href="/projects">Projects</Link>
      <Link href="/reviews">Reviews</Link>
      <Link href="/notifications">Notifications</Link>
      <Link href="/settings">Settings</Link>
      {!isPending && (session ? (
        <Link href="/settings/account">Account</Link>
      ) : (
        <>
          <Link href="/login">Log in</Link>
          <Link href="/signup">Sign up</Link>
        </>
      ))}
    </nav>
  );
}
