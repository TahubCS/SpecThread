import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { getInvitationPreview } from "@/lib/invitations";
import { AcceptInvitation, InvitationSwitchAccount } from "@/components/teams/accept-invitation";
import styles from "@/components/teams/teams.module.css";

export const metadata = { title: "Team invitation · SpecThread", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitationPreview(token);
  const session = await auth.api.getSession({ headers: await headers() });
  const matches = session?.user.email.trim().toLowerCase() === invitation?.email.toLowerCase();
  let joined = false;
  if (invitation?.status === "accepted" && matches && session?.user.emailVerified) {
    const response = await apiFetch(`/teams/${invitation.teamId}`);
    if (response.ok) joined = true;
    else if (![401, 404].includes(response.status)) throw new Error("Team membership could not be checked.");
  }
  const next = encodeURIComponent(`/invites/${token}`);
  return <section className={styles.onboarding}><div className={`${styles.onboardingContent} ${styles.page}`}>
    <p className={styles.onboardingBrand}>SpecThread</p>
    <h1>{joined ? "You’ve joined this team" : invitation?.status === "pending" ? "You’re invited to a team" : "Invitation unavailable"}</h1>
    {invitation ? <><dl className={styles.invitationFacts}>
      <div><dt>Team</dt><dd>{invitation.teamName}</dd></div><div><dt>Invited by</dt><dd>{invitation.inviterName}</dd></div>
      <div><dt>Invited email</dt><dd>{invitation.email}</dd></div><div><dt>Role</dt><dd>{invitation.role === "admin" ? "Admin" : "Member"}</dd></div>
      <div><dt>Expires</dt><dd><time dateTime={invitation.expiresAt}>{new Date(invitation.expiresAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time></dd></div>
    </dl>
      {joined ? <Link className={styles.primary} href={`/teams/${invitation.teamId}`}>Open team</Link> : invitation.status !== "pending" ?
        <p className={styles.intro}>{invitation.status === "accepted" ? "This invitation has already been used." : invitation.status === "expired" ? "This invitation has expired." : invitation.status === "revoked" ? "This invitation has been revoked." : "The inviter no longer has permission to invite you."} Ask a team Owner or Admin for a fresh link.</p> :
        !session ? <><p className={styles.intro}>Sign in or create an account with the invited email, then accept to join.</p><div className={styles.actions}>
          <Link className={styles.primary} href={`/login?next=${next}`}>Sign in</Link><Link className={styles.secondary} href={`/signup?next=${next}`}>Create account</Link></div></> :
        !matches ? <><p className={styles.intro}>You’re signed in as {session.user.email}. Use the verified account matching {invitation.email} to accept.</p><InvitationSwitchAccount token={token} /></> :
        !session.user.emailVerified ? <p className={styles.intro}>Verify {invitation.email} using your verification email, then return here to accept.</p> :
        <><p className={styles.intro}>Accepting joins {invitation.teamName} and completes account setup. You won’t need to create a separate first team.</p><AcceptInvitation token={token} /></>}
    </> : <p className={styles.intro}>This link is invalid or has been replaced. Ask a team Owner or Admin for a fresh invitation.</p>}
  </div></section>;
}
