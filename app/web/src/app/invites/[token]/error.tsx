"use client";
import styles from "@/components/teams/teams.module.css";
export default function Error({ reset }: { reset: () => void }) {
  return <section className={styles.onboarding}><div className={`${styles.onboardingContent} ${styles.page}`}>
    <p className={styles.onboardingBrand}>SpecThread</p><h1>Invitation couldn’t be loaded</h1>
    <p className={styles.intro} role="alert">We couldn’t check this invitation. Try loading it again.</p>
    <button className={styles.secondary} onClick={reset}>Try again</button>
  </div></section>;
}
