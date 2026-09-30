"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { navigationFor } from "@/lib/scaffold-routes";

/** Renders parent and related scaffold links for the current pathname, or nothing if it is unrecognized. */
export function ScaffoldNavigation() {
  const navigation = navigationFor(usePathname());
  if (!navigation) return null;

  return (
    <nav aria-label="Page navigation" className="scaffold-navigation">
      <div className="scaffold-navigation-heading">
        <h2>Explore related pages</h2>
        <p>Follow the planned route through this workspace.</p>
      </div>
      <div className="scaffold-links">
        {navigation.parent && (
          <Link className="scaffold-parent-link" href={navigation.parent.href}>
            <ArrowLeft size={17} aria-hidden="true" /> Back to {navigation.parent.label}
          </Link>
        )}
        {navigation.links.map(link => (
          <Link className="scaffold-link" key={link.href} href={link.href}>
            <span>{link.label}</span><ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </nav>
  );
}
