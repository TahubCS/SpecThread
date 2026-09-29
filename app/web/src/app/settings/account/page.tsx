import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountPanel } from "@/components/account-panel";
import { auth } from "@/lib/auth";
import { isUsableSignInMethod } from "@/lib/sign-in-methods";

export const metadata: Metadata = { title: "Account", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect("/login");
  const accounts = await auth.api.listUserAccounts({ headers: requestHeaders });
  const providers = auth.options.socialProviders;
  const { github, google } = providers;
  return (
    <AccountPanel
      user={{ name: session.user.name, email: session.user.email, emailVerified: session.user.emailVerified }}
      linked={accounts.map(account => ({
        id: account.id,
        providerId: account.providerId,
        usable: isUsableSignInMethod(account.providerId, providers),
      }))}
      available={[...(google.enabled ? ["google" as const] : []), ...(github.enabled ? ["github" as const] : [])]}
    />
  );
}
