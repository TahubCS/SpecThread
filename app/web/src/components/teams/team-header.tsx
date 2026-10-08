"use client";
import Link from "next/link";
import { Star, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Team } from "@/lib/team-types";
import { TeamMenu } from "./team-menu";
import styles from "./teams.module.css";

export function TeamHeader({ team }: { team: Team }) {
  const router = useRouter();
  return <header className={styles.teamHeader}>
    <Link href={"/teams/" + team.id}><Users size={18} aria-hidden="true" /><span>{team.name}</span></Link>
    {team.isFavorite && <Star size={15} className={styles.favoriteStar} aria-label="Favorite team" />}
    <TeamMenu key={team.isFavorite.toString()} team={team} onChange={() => router.refresh()} />
  </header>;
}
