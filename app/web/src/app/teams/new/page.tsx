import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CreateTeamForm } from "@/components/teams/create-team-form";
import { requireTeamSession } from "@/lib/teams";
import styles from "@/components/teams/teams.module.css";

/** Creates a team through the C# API, with the caller as its owner. */
export default async function Page() {
  await requireTeamSession("/teams/new");
  return <section className={styles.page} aria-labelledby="create-team-title">
    <Link href="/teams" className={styles.back}><ArrowLeft size={14} aria-hidden="true" />Back to teams</Link>
    <header className={styles.header}><div><h1 id="create-team-title">Create team</h1><p className={styles.intro}>Give your team a name and a shared purpose.</p></div></header>
    <CreateTeamForm />
  </section>;
}
