"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Plus, Search, Users } from "lucide-react";
import { teamRoleLabels, type Team } from "@/lib/team-types";
import styles from "./teams.module.css";

/** Compact, searchable memberships; only API-authorized teams appear. */
export function TeamList({ teams }: { teams: Team[] }) {
  const [query, setQuery] = useState("");
  const shown = teams.filter(team => team.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <section className={styles.page} aria-labelledby="teams-title">
      <header className={styles.header}>
        <div><h1 id="teams-title">Teams</h1><p className={styles.intro}>Your teams and the people you work with.</p></div>
        <Link className={styles.primary} href="/teams/new"><Plus size={16} aria-hidden="true" />Create team</Link>
      </header>
      {teams.length > 0 && <label className={styles.search}>
        <Search size={16} aria-hidden="true" />
        <input type="search" aria-label="Search teams" placeholder="Search teams…" value={query} onChange={event => setQuery(event.target.value)} />
      </label>}
      {shown.length > 0 ? <ul className={styles.list} aria-label="Your teams">
        {shown.map(team => <li key={team.id}>
          <Link className={styles.row} href={`/teams/${team.id}`}>
            <span className={styles.name}><Users size={17} aria-hidden="true" /><span>{team.name}</span></span>
            <span className={styles.meta}>{teamRoleLabels[team.role]}</span>
            <span className={styles.meta}>{team.memberCount} {team.memberCount === 1 ? "member" : "members"}</span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </li>)}
      </ul> : <div className={styles.empty} role="status">
        <h2>{teams.length ? "No matching teams" : "Create your first team"}</h2>
        <p>{teams.length ? "Try another team name or clear your search." : "Bring your collaborators together in a team."}</p>
        {teams.length ? <button className={styles.secondary} onClick={() => setQuery("")}>Clear search</button> :
          <Link className={styles.secondary} href="/teams/new">Create team</Link>}
      </div>}
    </section>
  );
}
