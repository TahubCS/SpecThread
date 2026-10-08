"use client";

import styles from "@/components/teams/teams.module.css";

/** Retryable error state without exposing configuration or provider responses. */
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className={styles.page} aria-labelledby="teams-error-title">
    <h1 id="teams-error-title">Teams couldn’t be loaded</h1>
    <p className={styles.intro}>Please try again in a moment.</p>
    <p><button className={styles.secondary} onClick={reset}>Try again</button></p>
  </section>;
}
