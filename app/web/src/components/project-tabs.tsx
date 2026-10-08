"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Overview", segment: "" },
  { label: "Requirements", segment: "/requirements" },
  { label: "Members", segment: "/members" },
  { label: "Settings", segment: "/settings" },
] as const;

/** Renders the project's section tabs. A tab stays current on its own sub-pages; Overview only on the project root. */
export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  return (
    <nav className="project-tabs" aria-label="Project sections">
      {tabs.map(({ label, segment }) => {
        const href = `${base}${segment}`;
        const current = segment ? pathname === href || pathname.startsWith(`${href}/`) : pathname === base;
        return (
          <Link key={label} href={href} className={current ? "is-current" : undefined} aria-current={current ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
