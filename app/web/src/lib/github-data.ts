import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { apiFetch } from "./api";
import { auth } from "./auth";
import { isUuid } from "./projects";
import {
  parseAvailableRepositories, parseProjectRepository, type AvailableRepositories, type ProjectRepository,
} from "./repositories";

/** Why the signed-in user's GitHub token is unavailable. */
export type GitHubAccess =
  | { token: string }
  | { token: null; reason: "not-linked" | "sign-in-again" };

/**
 * Reads the signed-in user's GitHub token from their linked GitHub account, refreshing it when
 * it has expired. The token goes to the API for one request and is never sent to the browser.
 */
export const gitHubAccess = cache(async (): Promise<GitHubAccess> => {
  const requestHeaders = await headers();
  const accounts = await auth.api.listUserAccounts({ headers: requestHeaders });
  const account = accounts.find(item => item.providerId === "github");
  if (!account) return { token: null, reason: "not-linked" };
  try {
    const { accessToken } = await auth.api.getAccessToken({ body: { accountId: account.id }, headers: requestHeaders });
    return accessToken ? { token: accessToken } : { token: null, reason: "sign-in-again" };
  } catch (error) {
    // The stored token is unreadable or could not be refreshed. Signing in with GitHub again replaces it.
    console.error("Reading the GitHub token failed", error instanceof Error ? error.message : "unknown error");
    return { token: null, reason: "sign-in-again" };
  }
});

/** Loads the repository connected to a project, or null when none is. Call after `requireProject`. */
export const getProjectRepository = cache(async (projectId: string): Promise<ProjectRepository | null> => {
  if (!isUuid(projectId)) notFound();
  const response = await apiFetch(`/projects/${projectId}/repository`);
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`GET /projects repository returned ${response.status}.`);
  return parseProjectRepository(await response.json());
});

/** What listing the user's GitHub repositories produced: the list, or the reason there is none. */
export type RepositoryListing =
  | { status: "ok"; list: AvailableRepositories }
  | { status: "token-rejected" }
  | { status: "not-configured" }
  | { status: "unavailable" };

/** Asks the API which repositories this GitHub token can reach through the SpecThread app. */
export async function listAvailableRepositories(token: string): Promise<RepositoryListing> {
  const response = await apiFetch("/github/repositories", { method: "POST", body: JSON.stringify({ githubToken: token }) });
  if (response.status === 400) return { status: "token-rejected" };
  if (response.status === 503) return { status: "not-configured" };
  if (response.status === 502) return { status: "unavailable" };
  if (!response.ok) throw new Error(`POST /github/repositories returned ${response.status}.`);
  return { status: "ok", list: parseAvailableRepositories(await response.json()) };
}
