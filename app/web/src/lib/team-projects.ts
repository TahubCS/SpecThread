import "server-only";
import { notFound, redirect } from "next/navigation";
import { apiFetch } from "./api";
import type { TeamRole } from "./team-types";
import { getTeam } from "./teams";

export type TeamProject = {
  id: string;
  teamId: string;
  name: string;
  teamName: string;
  teamRole: TeamRole;
  requirementCount: number;
  createdAt: string;
  archivedAt: string | null;
};

/** Team pages validate both the API shape and its requested team/archive scope. */
export async function getTeamProjects(teamId: string, archived = false): Promise<TeamProject[]> {
  await getTeam(teamId);
  const response = await apiFetch(`/teams/${teamId}/projects?archived=${archived}`);
  if (response.status === 401) redirect("/login");
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Team projects could not be loaded.");
  const value: unknown = await response.json();
  if (!Array.isArray(value)) throw new Error("Invalid team projects response.");
  return value.map(item => parseTeamProject(item, teamId, archived));
}

export function parseTeamProject(item: unknown, teamId: string, archived: boolean): TeamProject {
  if (!item || typeof item !== "object") throw new Error("Invalid project response.");
  const project = item as Record<string, unknown>;
  if (typeof project.id !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(project.id) ||
      project.teamId !== teamId || typeof project.name !== "string" || !project.name ||
      typeof project.teamName !== "string" || !project.teamName || typeof project.teamRole !== "string" ||
      !["owner", "admin", "member"].includes(project.teamRole) ||
      typeof project.requirementCount !== "number" || !Number.isSafeInteger(project.requirementCount) || project.requirementCount < 0 ||
      typeof project.createdAt !== "string" || !Number.isFinite(Date.parse(project.createdAt)) ||
      (archived ? typeof project.archivedAt !== "string" || !Number.isFinite(Date.parse(project.archivedAt)) : project.archivedAt !== null))
    throw new Error("Invalid project response.");
  return project as TeamProject;
}
