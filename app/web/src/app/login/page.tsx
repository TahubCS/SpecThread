import type { Metadata } from "next";
import { AuthPlaceholder } from "@/components/auth-placeholder";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return <AuthPlaceholder />;
}
