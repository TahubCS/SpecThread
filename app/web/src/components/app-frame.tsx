"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArrowLeft, Bell, Menu } from "lucide-react";
import { frameFor, isInvitationPath } from "@/lib/app-navigation";
import { SettingsSidebar } from "./settings-sidebar";
import { WorkspaceSidebar, workspaceTitleFor } from "./workspace-sidebar";
import teamStyles from "./teams/teams.module.css";

/**
 * Wraps page content in a sidebar with a mobile drawer and a top bar showing the section title.
 * Following any link inside the sidebar, including search results and menus, closes the drawer.
 */
function AppShell({ sidebar, title, children }: {
  sidebar: ReactNode;
  title: string | null;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell" onKeyDown={event => {
      if (mobileOpen && event.key === "Escape") setMobileOpen(false);
    }}>
      <div className="app-mobile-bar">
        <button type="button" className="icon-button" aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
        <span className="app-mobile-title">SpecThread</span>
        <Link className="icon-button" href="/notifications" aria-label="Inbox"><Bell size={18} /></Link>
      </div>
      {mobileOpen && <button type="button" className="app-sidebar-backdrop"
        aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`app-sidebar${mobileOpen ? " is-open" : ""}`}
        onClick={event => { if ((event.target as HTMLElement).closest("a")) setMobileOpen(false); }}>
        {sidebar}
      </aside>
      <div className="app-content">
        {title && (
          <header className="app-topbar">
            <span className="app-breadcrumb">{title}</span>
            <Link className="icon-button" href="/notifications" aria-label="Inbox"><Bell size={17} aria-hidden="true" /></Link>
          </header>
        )}
        <main id="main-content" tabIndex={-1} className="app-main">{children}</main>
      </div>
    </div>
  );
}

/**
 * Selects the frame for the current route. The landing, login, and signup pages bring their own
 * header and footer; password, sign-in error, and policy pages get a minimal public header; personal, help, and onboarding pages
 * get the settings sidebar; everything else gets the workspace sidebar.
 * This does not enforce access control.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/onboarding" || isInvitationPath(pathname)) return <main id="main-content" tabIndex={-1} className={teamStyles.onboardingMain}>{children}</main>;
  const frame = frameFor(pathname);
  if (frame === "settings") {
    return <AppShell sidebar={<SettingsSidebar />} title="Settings">{children}</AppShell>;
  }
  if (frame === "workspace") {
    // A project's pages bring their own bar with the project name (projects/[projectId]/layout.tsx),
    // and a team's pages their own header.
    const ownBar = /^\/projects\/(?!new$)[^/]+/.test(pathname) || /^\/teams\/[\da-f-]{36}(?:\/|$)/i.test(pathname);
    return <AppShell sidebar={<WorkspaceSidebar />} title={ownBar ? null : workspaceTitleFor(pathname)}>{children}</AppShell>;
  }
  if (["/", "/login", "/signup"].includes(pathname)) return <>{children}</>;
  return (
    <div className="public-frame auth-frame">
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/">
            <Image src="/thread-mark.png" alt="" width={39} height={22} unoptimized />
            <span>SpecThread</span>
          </Link>
          <Link className="auth-back" href="/"><ArrowLeft size={17} aria-hidden="true" /> Back to home</Link>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer>SpecThread · Requirements, evidence, and human review. <Link href="/#about">About</Link></footer>
    </div>
  );
}
