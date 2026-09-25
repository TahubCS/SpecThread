"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function LandingNavigation() {
  const { data: session, isPending } = authClient.useSession();
  const accountLinks = !isPending && (session ? (
    <Link className="landing-nav-cta" href="/dashboard">Dashboard</Link>
  ) : (
    <>
      <Link href="/login">Log in</Link>
      <Link className="landing-nav-cta" href="/signup">Get started</Link>
    </>
  ));

  return (
    <nav className="landing-nav" aria-label="Main navigation">
      <div className="landing-nav-primary">
        <Link href="#product">Product</Link>
        <Link href="/about/how-it-works">How it works</Link>
        <Link href="/about">About</Link>
      </div>
      <div className="landing-nav-account">{accountLinks}</div>
      <details className="landing-mobile-menu">
        <summary aria-label="Open navigation"><Menu size={20} aria-hidden="true" /></summary>
        <div className="landing-mobile-links">
          <Link href="#product">Product</Link>
          <Link href="/about/how-it-works">How it works</Link>
          <Link href="/about">About</Link>
          {accountLinks}
        </div>
      </details>
    </nav>
  );
}

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
