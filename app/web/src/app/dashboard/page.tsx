import type { Metadata } from "next";
import { DashboardPreview } from "@/components/dashboard-preview";

export const metadata: Metadata = { title: "Dashboard" };

/** Renders the public dashboard preview with sample requirements and example links. */
export default function DashboardPage() {
  return <DashboardPreview />;
}
