"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import {
  Bell, ChevronDown, FileText, FolderKanban, House, Inbox,
  LogIn, Menu, Plus, Search, Settings, Users, X,
  type LucideIcon,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { LandingNavigation, MainNavigation } from "./main-navigation";

const appPrefixes = ["/dashboard", "/projects", "/teams", "/reviews", "/notifications", "/settings"];

const destinations = [
  { label: "Overview", href: "/dashboard", icon: House },
  { label: "Inbox", href: "/notifications", icon: Inbox },
  { label: "Reviews", href: "/reviews", icon: FileText },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Teams", href: "/teams", icon: Users },
] as const;

/** Returns the product section title for a pathname prefix, defaulting to "Overview". */
function titleFor(pathname: string) {
  if (pathname.startsWith("/projects")) return "Projects";
  if (pathname.startsWith("/teams")) return "Teams";
  if (pathname.startsWith("/reviews")) return "Reviews";
  if (pathname.startsWith("/notifications")) return "Inbox";
  if (pathname.startsWith("/settings")) return "Settings";
  return "Overview";
}

/** Renders an icon link; current marks the active page, and nested applies indented styling. */
function AppNavLink({ href, label, icon: Icon, current, nested = false }: {
  href: string;
  label: string;
  icon: LucideIcon;
  current: boolean;
  nested?: boolean;
}) {
  return (
    <Link className={`app-nav-link${current ? " is-current" : ""}${nested ? " is-nested" : ""}`}
      href={href} aria-current={current ? "page" : undefined}>
      <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

/**
 * Wraps product content in sidebar navigation with a mobile drawer and page search.
 * Search filters the fixed destination labels, ignoring case and surrounding spaces.
 * Account links wait for the client session lookup; team and requirement links use example IDs.
 */
function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchDialog = useRef<HTMLDialogElement>(null);
  const { data: session, isPending } = authClient.useSession();
  const title = titleFor(pathname);
  const matches = destinations.filter(destination =>
    destination.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  /** Builds a sidebar link, marking descendants current unless exact is true. */
  const link = (href: string, label: string, icon: LucideIcon, exact = false, nested = false) => (
    <AppNavLink href={href} label={label} icon={icon} nested={nested}
      current={exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)} />
  );

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
      <aside className={`app-sidebar${mobileOpen ? " is-open" : ""}`}>
        <div className="app-sidebar-top">
          <Link className="app-brand" href="/dashboard" onClick={() => setMobileOpen(false)}>
            <Image src="/thread-mark.png" alt="" width={39} height={22}
              loading="eager" unoptimized aria-hidden="true" />
            <span>SpecThread</span>
            <ChevronDown size={14} aria-hidden="true" />
          </Link>
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
        <nav className="app-sidebar-nav" aria-label="Main navigation"
          onClick={event => { if ((event.target as HTMLElement).closest("a")) setMobileOpen(false); }}>
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
            <Link className="app-team-name" href="/teams/example-team">Example team <ChevronDown size={13} aria-hidden="true" /></Link>
            {link("/teams/example-team", "Home", House, true, true)}
            {link("/teams/example-team/projects", "Projects", FolderKanban, false, true)}
            <Link className={`app-nav-link is-nested${pathname === "/projects/example-project/requirements" ? " is-current" : ""}`}
              href="/projects/example-project/requirements"
              aria-current={pathname === "/projects/example-project/requirements" ? "page" : undefined}>
              <FileText size={17} strokeWidth={1.7} aria-hidden="true" /><span>Requirements</span>
            </Link>
          </div>
        </nav>
        <div className="app-sidebar-bottom">
          {link("/settings", "Settings", Settings)}
          {!isPending && (session ? (
            <Link className="app-account-link" href="/settings/account">Account</Link>
          ) : (
            <Link className="app-account-link" href="/login"><LogIn size={15} aria-hidden="true" /> Log in</Link>
          ))}
        </div>
      </aside>
      <div className="app-content">
        <header className="app-topbar">
          <span className="app-breadcrumb"><House size={16} aria-hidden="true" /> {title}</span>
          <Link className="icon-button" href="/notifications" aria-label="Inbox"><Bell size={18} aria-hidden="true" /></Link>
        </header>
        <main id="main-content" tabIndex={-1} className="app-main">{children}</main>
      </div>
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
    </div>
  );
}

/**
 * Selects the product shell for dashboard, project, team, review, notification, and
 * settings routes and their descendants; other paths receive a public frame.
 * The home page uses its own navigation and footer. This does not enforce access control.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (appPrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return <AppShell>{children}</AppShell>;
  }
  const landing = pathname === "/";
  return (
    <div className={`public-frame${landing ? " landing-frame" : ""}`}>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/">
            <Image src="/thread-mark.png" alt="" width={39} height={22} unoptimized />
            <span>SpecThread</span>
          </Link>
          {landing ? <LandingNavigation /> : <MainNavigation />}
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      {landing ? (
        <footer className="landing-footer">See the evidence. Make the decision.</footer>
      ) : (
        <footer>SpecThread · Requirements, evidence, and human review. <Link href="/about">About</Link></footer>
      )}
    </div>
  );
}
