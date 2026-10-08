"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./teams.module.css";

const sections = [["", "Overview"], ["/members", "Members"]] as const;

/** Routable sections styled as tabs; keyboard users retain ordinary link behavior. */
export function TeamTabs({ teamId }: { teamId: string }) {
  const pathname = usePathname();
  if (pathname !== "/teams/" + teamId && pathname !== "/teams/" + teamId + "/members") return null;
  return <nav className={styles.tabs} aria-label="Team sections">
    {sections.map(([suffix, label]) => {
      const href = `/teams/${teamId}${suffix}`;
      return <Link href={href} key={label} aria-current={pathname === href ? "page" : undefined}>{label}</Link>;
    })}
  </nav>;
}
