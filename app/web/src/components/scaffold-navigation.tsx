"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationFor } from "@/lib/scaffold-routes";

export function ScaffoldNavigation() {
  const navigation = navigationFor(usePathname());
  if (!navigation) return null;

  return (
    <nav aria-label="Page navigation" className="stack">
      <p className="muted">Explore pages</p>
      <div className="actions">
        {navigation.parent && <Link href={navigation.parent.href}>Back to {navigation.parent.label}</Link>}
        {navigation.links.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </div>
    </nav>
  );
}
