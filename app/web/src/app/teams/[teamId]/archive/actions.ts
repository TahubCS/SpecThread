"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { parseTeamProject } from "@/lib/team-projects";
import { requireTeamSession } from "@/lib/teams";
import type { TeamActionState } from "../actions";

export async function restoreTeamProject(teamId: string, projectId: string): Promise<TeamActionState> {
  await requireTeamSession(`/teams/${encodeURIComponent(teamId)}/archive`);
  const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  if (!uuid.test(teamId) || !uuid.test(projectId)) return { errors: {}, message: "This project is unavailable." };
  let current: Response;
  try { current = await apiFetch(`/projects/${projectId}`); }
  catch { return { errors: {}, message: "The project couldn’t be checked. Try loading it again." }; }
  if (current.status === 401) redirect("/login");
  if (!current.ok) return { errors: {}, message: "This project is unavailable. Refresh to check your access." };
  let response: Response;
  try {
    // Project team IDs cannot be changed. Check scope before using the existing restore API.
    const project: unknown = await current.json();
    if (!project || typeof project !== "object" || !("teamId" in project) || project.teamId !== teamId)
      return { errors: {}, message: "This project does not belong to this team." };
    response = await apiFetch(`/projects/${projectId}/restore`, { method: "POST" });
  } catch { return { errors: {}, message: "We couldn’t confirm restoration. Refresh before trying again." }; }
  if (response.status === 401) redirect("/login");
  if (!response.ok) {
    const problem: unknown = await response.json().catch(() => null);
    return { errors: {}, message: problem && typeof problem === "object" && "detail" in problem && typeof problem.detail === "string" ? problem.detail : "The project couldn’t be restored. Refresh to check your access." };
  }
  try { if (parseTeamProject(await response.json(), teamId, false).id !== projectId) throw new Error("Invalid project."); }
  catch { return { errors: {}, message: "The project may have been restored. Refresh to check." }; }
  revalidatePath(`/teams/${teamId}`, "layout");
  revalidatePath("/projects");
  return { errors: {}, success: true };
}
