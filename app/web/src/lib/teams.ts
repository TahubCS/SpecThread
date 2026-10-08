import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "./auth";
import { apiFetch } from "./api";
import { parseOnboarding, parseTeam, parseTeamMembers, parseTeams } from "./team-types";

/** Validates the session on pages and actions, including calls without the page proxy. */
export async function requireTeamSession(next: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  return session;
}

/** Loads real memberships; failures reach the Teams error boundary. */
export async function getTeams() {
  await requireTeamSession("/teams");
  const response = await apiFetch("/teams");
  if (response.status === 401) redirect("/login?next=%2Fteams");
  if (!response.ok) throw new Error("Teams could not be loaded.");
  return parseTeams(await response.json());
}

export async function getOnboarding() {
  await requireTeamSession("/onboarding");
  const response = await apiFetch("/onboarding");
  if (response.status === 401) redirect("/login?next=%2Fonboarding");
  if (!response.ok) throw new Error("Account setup could not be loaded.");
  return parseOnboarding(await response.json());
}

export async function getTeamMembers(id: string) {
  await getTeam(id);
  const response = await apiFetch(`/teams/${id}/members`);
  if (response.status === 401) redirect("/login");
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Team members could not be loaded.");
  return parseTeamMembers(await response.json());
}

/** The layout and overview share one membership-checked lookup per server render. */
export const getTeam = cache(async (id: string) => {
  await requireTeamSession(`/teams/${encodeURIComponent(id)}`);
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) notFound();
  const response = await apiFetch(`/teams/${id}`);
  if (response.status === 401) redirect(`/login?next=${encodeURIComponent(`/teams/${id}`)}`);
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("This team could not be loaded.");
  return parseTeam(await response.json());
});
