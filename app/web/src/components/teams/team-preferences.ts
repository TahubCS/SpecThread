import { parseTeam } from "@/lib/team-types";

/** Persists only personal navigation preferences, without browser bearer tokens. */
export async function updateTeamPreferences(id: string, preferences: { isFavorite?: boolean; isExpanded?: boolean }) {
  const response = await fetch(`/api/teams/${id}/preferences`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(preferences),
  });
  if (!response.ok) throw new Error("Team preferences couldn’t be saved. Try again.");
  const team = parseTeam(await response.json());
  window.dispatchEvent(new Event("specthread:teams-changed"));
  return team;
}
