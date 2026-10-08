import styles from "@/components/teams/teams.module.css";
export default function Loading() {
  return <section className={styles.onboarding}><div className={`${styles.onboardingContent} ${styles.page}`}>
    <p className={styles.onboardingBrand}>SpecThread</p><p role="status">Loading invitation…</p>
  </div></section>;
}
