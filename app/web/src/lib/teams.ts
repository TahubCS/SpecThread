import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "./auth";
import { apiFetch } from "./api";
import { parseOnboarding, parseTeam, parseTeamMembers, parseTeams } from "./team-types";

/** One session lookup per server render, shared by every team read in it. */
const requestSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** Validates the session on pages and actions, including calls without the page proxy. */
export async function requireTeamSession(next: string) {
  const session = await requestSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  return session;
}

const teamIdPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/**
 * Reads a team-scoped API resource together with the membership-checked team lookup that gates
 * it, instead of one after the other. The session and team ID are checked first, so a missing
 * session still redirects and a malformed ID never reaches the API.
 */
export async function readWithTeam(id: string, path: `/${string}`) {
  await requireTeamSession(`/teams/${encodeURIComponent(id)}`);
  if (!teamIdPattern.test(id)) notFound();
  const [team, response] = await Promise.all([getTeam(id), apiFetch(path)]);
  return { team, response };
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
  const { response } = await readWithTeam(id, `/teams/${id}/members`);
  if (response.status === 401) redirect("/login");
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Team members could not be loaded.");
  return parseTeamMembers(await response.json());
}

/** The layout and overview share one membership-checked lookup per server render. */
export const getTeam = cache(async (id: string) => {
  await requireTeamSession(`/teams/${encodeURIComponent(id)}`);
  if (!teamIdPattern.test(id)) notFound();
  const response = await apiFetch(`/teams/${id}`);
  if (response.status === 401) redirect(`/login?next=${encodeURIComponent(`/teams/${id}`)}`);
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("This team could not be loaded.");
  return parseTeam(await response.json());
});
