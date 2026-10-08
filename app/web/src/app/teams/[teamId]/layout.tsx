import type { ReactNode } from "react";
import { getTeam } from "@/lib/teams";
import { TeamTabs } from "@/components/teams/team-tabs";
import { TeamHeader } from "@/components/teams/team-header";
import styles from "@/components/teams/teams.module.css";

/** Every team section verifies real membership through the C# API. */
export default async function TeamLayout({ children, params }: { children: ReactNode; params: Promise<{ teamId: string }> }) {
  const team = await getTeam((await params).teamId);
  return <section className={styles.teamPage} aria-label={team.name + " team"}>
    <TeamHeader team={team} />
    <TeamTabs teamId={team.id} />
    {children}
  </section>;
}
