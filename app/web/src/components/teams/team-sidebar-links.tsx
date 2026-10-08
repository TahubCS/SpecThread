"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronDown, FolderKanban, House, Star, Users } from "lucide-react";
import { parseTeams, type Team } from "@/lib/team-types";
import { AppNavLink } from "@/components/app-nav-link";
import styles from "./teams.module.css";
import { TeamMenu } from "./team-menu";
import { updateTeamPreferences } from "./team-preferences";

type State = { teams: Team[] } | { message: string } | null;

/** Real team links refreshed after navigation or an explicit retry, without browser JWTs. */
export function TeamSidebarLinks() {
  const pathname = usePathname();
  const [state, setState] = useState<State>(null);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => setRetry(value => value + 1);
    window.addEventListener("specthread:teams-changed", refresh);
    return () => window.removeEventListener("specthread:teams-changed", refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/teams", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Team lookup failed.");
        const teams = parseTeams(await response.json());
        if (!controller.signal.aborted) setState({ teams });
      } catch {
        if (!controller.signal.aborted) setState({ message: "Teams couldn’t be loaded." });
      }
    }
    void load();
    return () => controller.abort();
  }, [pathname, retry]);
  if (!state) return <p className={styles.sidebarStatus} role="status">Loading teams…</p>;
  if ("message" in state) return <p className={styles.sidebarStatus} role="status">
    {state.message} <button onClick={() => { setState(null); setRetry(value => value + 1); }}>Retry</button>
  </p>;
  if (!state.teams.length) return <p className={styles.sidebarStatus}>No teams yet</p>;
  const replace = (updated: Team) => setState(previous => previous && "teams" in previous
    ? { teams: previous.teams.map(team => team.id === updated.id ? updated : team) } : previous);
  return <>{[...state.teams].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name)).map(team => {
    const home = "/teams/" + team.id;
    const homeCurrent = pathname === home || pathname.startsWith(home + "/members");
    return <section key={team.id} className={styles.sidebarTeam} aria-label={team.name}>
      <div className={styles.sidebarTeamHeading}>
        <Users size={17} aria-hidden="true" />
        <Link href={home} className={styles.sidebarTeamName}>{team.name}</Link>
        {team.isFavorite && <Star size={12} className={styles.favoriteStar} aria-label="Favorite team" />}
        <button className={styles.expandButton} aria-label={(team.isExpanded ? "Collapse " : "Expand ") + team.name}
          aria-expanded={team.isExpanded} aria-controls={"team-links-" + team.id} disabled={saving === team.id}
          onClick={async () => {
            setSaving(team.id); setError("");
            try { replace(await updateTeamPreferences(team.id, { isExpanded: !team.isExpanded })); }
            catch { setError("Team expansion couldn’t be saved. Try again."); }
            finally { setSaving(null); }
          }}><ChevronDown size={13} className={team.isExpanded ? "" : styles.collapsed} aria-hidden="true" /></button>
        <TeamMenu key={String(team.isFavorite)} team={team} onChange={replace} />
      </div>
      <div id={"team-links-" + team.id} hidden={!team.isExpanded}>
        <AppNavLink href={home} label="Home" icon={House} current={homeCurrent} nested />
        <AppNavLink href={home + "/projects"} label="Projects" icon={FolderKanban}
          current={pathname === home + "/projects" || pathname.startsWith(home + "/projects/")} nested />
      </div>
    </section>;
  })}{error && <p className={styles.sidebarStatus} role="alert">{error}</p>}</>;
}
