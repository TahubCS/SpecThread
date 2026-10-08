import { getTeam } from "@/lib/teams";
import styles from "./teams.module.css";

/** Keeps later slices explicit and checks membership even when a parent layout is reused. */
export async function TeamPlannedSection({ params, title }: { params: Promise<{ teamId: string }>; title: string }) {
  await getTeam((await params).teamId);
  return <section className={styles.summary}>
    <h2>{title}</h2>
    <p className={styles.intro} role="status">This section is planned. It will be connected in an upcoming Teams slice.</p>
  </section>;
}
