"use client";
import styles from "@/components/teams/teams.module.css";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className={styles.onboarding}><div className={styles.onboardingContent + " " + styles.page}>
    <h1>Team setup couldn’t be loaded</h1>
    <p>Please try again in a moment.</p>
    <button className={styles.primary} onClick={reset}>Try again</button>
  </div></section>;
}
