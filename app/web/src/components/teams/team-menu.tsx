"use client";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Archive, Link as LinkIcon, LogOut, MoreHorizontal, Settings, Star } from "lucide-react";
import type { Team } from "@/lib/team-types";
import { updateTeamPreferences } from "./team-preferences";
import { LeaveTeamDialog } from "./leave-team-button";
import styles from "./teams.module.css";

/** Native popover escapes the sidebar's scroll container and supports Tab/Escape. */
export function TeamMenu({ team, onChange }: { team: Team; onChange?: (team: Team) => void }) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [favorite, setFavorite] = useState(team.isFavorite);
  const [leaving, setLeaving] = useState(false);
  const base = "/teams/" + team.id;
  async function toggleFavorite() {
    setBusy(true); setMessage("");
    try {
      const updated = await updateTeamPreferences(team.id, { isFavorite: !favorite });
      setFavorite(updated.isFavorite);
      onChange?.(updated);
      menu.current?.hidePopover();
    } catch { setMessage("Favorite couldn’t be saved. Try again."); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className={styles.menuTrigger} aria-label={"Team actions for " + team.name}
      popoverTarget={id} onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        setPosition({ left: Math.max(8, Math.min(rect.right, window.innerWidth - 256)),
          top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 300)) });
        setMessage("");
      }}><MoreHorizontal size={18} aria-hidden="true" /></button>
    <div ref={menu} id={id} popover="auto" className={styles.menu} style={position}
      role="group" aria-label={"Actions for " + team.name}>
      <button disabled={busy} onClick={() => void toggleFavorite()}><Star size={17} />{favorite ? "Unfavorite" : "Favorite"}</button>
      <hr />
      <Link href={base + "/settings"} onClick={() => menu.current?.hidePopover()}><Settings size={17} />Team settings</Link>
      <button onClick={async () => {
        try { await navigator.clipboard.writeText(window.location.origin + base); setMessage("Team URL copied."); }
        catch { setMessage("The team URL couldn’t be copied. Try again."); }
      }}><LinkIcon size={17} />Copy URL</button>
      <Link href={base + "/archive"} onClick={() => menu.current?.hidePopover()}><Archive size={17} />Open archive</Link>
      <hr />
      <button onClick={() => { menu.current?.hidePopover(); setLeaving(true); }}><LogOut size={17} />Leave team…</button>
      {message && <p role="status">{message}</p>}
    </div>
    <LeaveTeamDialog team={team} open={leaving} onClose={() => setLeaving(false)} />
  </>;
}
