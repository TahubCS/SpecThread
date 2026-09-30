import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Terms of use" };

/** Renders the public terms of use page. */
export default function TermsPage() {
  return <PolicyPage title="Terms of use" description="Terms that apply to the SpecThread service." />;
}
