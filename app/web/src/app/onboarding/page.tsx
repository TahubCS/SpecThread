import { redirect } from "next/navigation";
import { getOnboarding } from "@/lib/teams";
import { CreateTeamForm } from "@/components/teams/create-team-form";
import styles from "@/components/teams/teams.module.css";

/** Server-checked first-team setup; only a committed API write completes it. */
export default async function Page() {
  if ((await getOnboarding()).completed) redirect("/teams");
  return <section className={styles.onboarding}>
    <div className={styles.onboardingContent + " " + styles.page}>
      <p className={styles.onboardingBrand}>SpecThread</p>
      <h1>Name your first team</h1>
      <p className={styles.intro}>Your projects and collaborators live inside teams. Create your first team to get started.</p>
      <CreateTeamForm initial />
    </div>
  </section>;
}
