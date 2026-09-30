import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Privacy" };

/** Renders the public privacy page. */
export default function PrivacyPage() {
  return <PolicyPage title="Privacy" description="Privacy information for SpecThread users." />;
}
