import Link from "next/link";
import styles from "@/components/teams/teams.module.css";

/** Missing and inaccessible teams have the same response. */
export default function TeamNotFound() {
  return <section className={styles.page}>
    <h1>Team not found</h1>
    <p className={styles.intro}>This team isn’t available to your account.</p>
    <p><Link className={styles.secondary} href="/teams">Back to teams</Link></p>
  </section>;
}
