import type { Metadata } from "next";
import { DashboardPreview } from "@/components/dashboard-preview";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <DashboardPreview />;
}
