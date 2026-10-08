import Link from "next/link";
import { FolderKanban, Settings, Users } from "lucide-react";
import { getTeam, getTeamMembers } from "@/lib/teams";
import { initialsOf } from "@/lib/app-navigation";
import { teamRoleLabels } from "@/lib/team-types";
import styles from "@/components/teams/teams.module.css";

/** Shows the authorized team's description and membership facts. */
export default async function Page({ params }: { params: Promise<{ teamId: string }> }) {
  const team = await getTeam((await params).teamId);
  const members = await getTeamMembers(team.id);
  const home = "/teams/" + team.id;
  return <div className={styles.overview}>
    <div className={styles.summary}>
    <div className={styles.homeTitle}><span className={styles.teamIcon}><Users size={26} aria-hidden="true" /></span><h1>{team.name}</h1></div>
    <p className={styles.description}>{team.description || "No description yet."}</p>
    <dl className={styles.facts}>
      <div><dt>Your role</dt><dd>{teamRoleLabels[team.role]}</dd></div>
      <div><dt>Members</dt><dd>{team.memberCount}</dd></div>
    </dl>
    </div>
    <aside className={styles.homeAside} aria-label="Team information">
      <h2>Members</h2>
      <Link href={home + "/members"} className={styles.memberPreview} aria-label={"View " + team.memberCount + " team members"}>
        {members.slice(0, 5).map(member => <span key={member.userId} className={styles.memberAvatar} title={member.name}>{initialsOf(member.name, member.email)}</span>)}
        <span>{team.memberCount}</span>
      </Link>
      <h2>Go to</h2>
      <Link href={home + "/projects"}><FolderKanban size={17} aria-hidden="true" />Projects</Link>
      <Link href={home + "/settings"}><Settings size={17} aria-hidden="true" />Team settings</Link>
    </aside>
  </div>;
}
