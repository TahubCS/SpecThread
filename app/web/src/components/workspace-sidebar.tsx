"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import {
  FileText, FolderKanban, House, Inbox, Plus, Search, Users, X,
  type LucideIcon,
} from "lucide-react";
import { AppNavLink } from "./app-nav-link";
import { ProfileMenu } from "./profile-menu";
import { TeamSidebarLinks } from "./teams/team-sidebar-links";

const destinations = [
  { label: "Overview", href: "/dashboard", icon: House },
  { label: "Inbox", href: "/notifications", icon: Inbox },
  { label: "Reviews", href: "/reviews", icon: FileText },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Teams", href: "/teams", icon: Users },
] as const;

/** Returns the workspace section title for a pathname prefix, defaulting to "Overview". */
export function workspaceTitleFor(pathname: string) {
  if (pathname.startsWith("/projects")) return "Projects";
  if (pathname.startsWith("/teams")) return "Teams";
  if (pathname.startsWith("/reviews")) return "Reviews";
  if (pathname.startsWith("/notifications")) return "Inbox";
  return "Overview";
}

/**
 * Renders the sidebar for project and team work, with page search and create shortcuts.
 * Search filters the fixed destination labels, ignoring case and surrounding spaces.
 * The profile menu links to settings and the account; teams use API-authorized memberships.
 */
export function WorkspaceSidebar() {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const searchDialog = useRef<HTMLDialogElement>(null);
  const matches = destinations.filter(destination =>
    destination.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  /** Builds a sidebar link, marking descendants current unless exact is true. */
  const link = (href: string, label: string, icon: LucideIcon, exact = false, nested = false) => (
    <AppNavLink href={href} label={label} icon={icon} nested={nested}
      current={exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)} />
  );

  return (
    <>
      <div className="app-sidebar-top">
        <ProfileMenu key={pathname} />
        <div className="app-sidebar-actions">
          <button type="button" className="icon-button" aria-label="Search navigation"
            onClick={() => { setQuery(""); searchDialog.current?.showModal(); }}>
            <Search size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <details className="app-create-menu">
            <summary className="icon-button" aria-label="Create"><Plus size={19} aria-hidden="true" /></summary>
            <div className="app-create-options">
              <Link href="/projects/new">New project</Link>
              <Link href="/teams/new">New team</Link>
              <Link href="/projects/example-project/requirements/new">New requirement (example)</Link>
            </div>
          </details>
        </div>
      </div>
      <nav className="app-sidebar-nav" aria-label="Main navigation">
        <div className="app-nav-group">
          <p className="app-nav-heading">My work</p>
          {link("/dashboard", "Overview", House, true)}
          {link("/notifications", "Inbox", Inbox)}
          {link("/reviews", "Reviews", FileText)}
        </div>
        <div className="app-nav-group">
          <p className="app-nav-heading">Workspace</p>
          {link("/projects", "Projects", FolderKanban)}
          {link("/teams", "Teams", Users, true)}
        </div>
        <div className="app-nav-group">
          <div className="app-nav-heading-row">
            <p className="app-nav-heading">Your teams</p>
            <Link href="/teams/new" aria-label="Create team"><Plus size={15} aria-hidden="true" /></Link>
          </div>
          <TeamSidebarLinks />
        </div>
      </nav>
      <dialog className="app-search-dialog" ref={searchDialog} aria-label="Search navigation">
        <div className="app-search-header">
          <Search size={18} aria-hidden="true" />
          <input autoFocus aria-label="Search pages" placeholder="Go to a page…"
            value={query} onChange={event => setQuery(event.target.value)} />
          <button type="button" className="icon-button" aria-label="Close search"
            onClick={() => searchDialog.current?.close()}><X size={17} /></button>
        </div>
        <div className="app-search-results">
          {matches.length ? matches.map(({ label, href, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => searchDialog.current?.close()}>
              <Icon size={17} aria-hidden="true" />{label}
            </Link>
          )) : <p>No matching pages</p>}
        </div>
      </dialog>
    </>
  );
}
