"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Accessibility, Bell, ChevronLeft, Database, FolderGit2, FolderPlus, Hand, LifeBuoy,
  MonitorSmartphone, Plug, SlidersHorizontal, UserRound,
} from "lucide-react";
import { isCurrentLink } from "@/lib/app-navigation";
import { AppNavLink } from "./app-nav-link";

const groups = [
  { heading: "Personal", links: [
    { label: "Preferences", href: "/settings", icon: SlidersHorizontal },
    { label: "Account", href: "/settings/account", icon: UserRound },
    { label: "Notifications", href: "/settings/notifications", icon: Bell },
    { label: "Accessibility", href: "/settings/accessibility", icon: Accessibility },
  ] },
  { heading: "Security & data", links: [
    { label: "Sessions", href: "/settings/sessions", icon: MonitorSmartphone },
    { label: "Integrations", href: "/settings/integrations", icon: Plug },
    { label: "Your data", href: "/settings/data", icon: Database },
  ] },
  { heading: "Getting started", links: [
    { label: "Welcome", href: "/welcome", icon: Hand },
    { label: "Project setup", href: "/onboarding/project", icon: FolderPlus },
    { label: "Repository setup", href: "/onboarding/repository", icon: FolderGit2 },
    { label: "Help", href: "/help", icon: LifeBuoy },
  ] },
] as const;

/**
 * Renders the sidebar for personal settings, onboarding, and help pages.
 * Invitation pages share this frame without a link because users reach them from invite URLs.
 * Only signed-in users reach it (ADR-023), so it always links back to the workspace.
 */
export function SettingsSidebar() {
  const pathname = usePathname();
  return (
    <>
      <div className="app-sidebar-top">
        <Link className="app-back-link" href="/dashboard"><ChevronLeft size={16} aria-hidden="true" /> Back to app</Link>
      </div>
      <nav className="app-sidebar-nav" aria-label="Settings navigation">
        {groups.map(group => (
          <div className="app-nav-group" key={group.heading}>
            <p className="app-nav-heading">{group.heading}</p>
            {group.links.map(link => (
              <AppNavLink key={link.href} href={link.href} label={link.label} icon={link.icon}
                current={isCurrentLink(link.href, pathname)} />
            ))}
          </div>
        ))}
      </nav>
    </>
  );
}
