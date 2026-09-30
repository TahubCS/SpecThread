import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** Renders an icon link; current marks the active page, and nested applies indented styling. */
export function AppNavLink({ href, label, icon: Icon, current, nested = false }: {
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
