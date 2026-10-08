import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { apiFetch } from "./api";
import { auth } from "./auth";
import {
  isProjectId, parseMembers, parseProject, parseRequirementSummaries,
  type Project, type ProjectMember, type RequirementSummary,
} from "./projects";

/** Reads one API resource for the current request. Throws on any failure other than 404, which returns null. */
async function read(path: `/${string}`): Promise<unknown | null> {
  const response = await apiFetch(path);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${path.split("/").slice(0, 2).join("/")} returned ${response.status}.`);
  return response.json();
}

/**
 * Loads a project the signed-in user belongs to, or shows the not-found page. The API answers
 * 404 for unknown projects and for non-members alike. Cached per request, so the project
 * layout and its pages share one call.
 */
export const requireProject = cache(async (projectId: string): Promise<Project> => {
  const body = isProjectId(projectId) ? await read(`/projects/${projectId}`) : null;
  if (body === null) notFound();
  return parseProject(body);
});

/** Lists a project's active requirements, oldest first. Call after `requireProject`. */
export const listRequirements = cache(async (projectId: string): Promise<RequirementSummary[]> => {
  const body = isProjectId(projectId) ? await read(`/projects/${projectId}/requirements`) : null;
  if (body === null) notFound();
  return parseRequirementSummaries(body);
});

/** Lists a project's members, owner first. Call after `requireProject`. */
export const listMembers = cache(async (projectId: string): Promise<ProjectMember[]> => {
  const body = isProjectId(projectId) ? await read(`/projects/${projectId}/members`) : null;
  if (body === null) notFound();
  return parseMembers(body);
});

/** Returns the signed-in user's ID, or null when there is no session. */
export const viewerId = cache(async (): Promise<string | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
});
