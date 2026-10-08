import styles from "@/components/teams/teams.module.css";

/** Accessible loading state while authorized team data is fetched. */
export default function Loading() {
  return <div className={styles.page} role="status">Loading teams…</div>;
}
