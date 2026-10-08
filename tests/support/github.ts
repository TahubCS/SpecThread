import { randomUUID } from "node:crypto";
import { runTestSql } from "../e2e/fixtures";

// Describes what the fake GitHub (scripts/test-github.mjs) shows to one test user.
const github = "http://127.0.0.1:5108/__github";

export type FakeInstallation = {
  id: number;
  /** False when the user still sees the installation but the app can no longer act on it. */
  appInstalled?: boolean;
  repositories: { id: number; owner: string; name: string; private?: boolean }[];
};

/** A positive number unlikely to collide with another test's installation or repository. */
export const githubId = () => Math.floor(Math.random() * 2_000_000_000) + 1;

/** Sets the installations and repositories GitHub shows for this token. */
export async function setGitHubUser(token: string, installations: FakeInstallation[]) {
  const response = await fetch(`${github}/users/${encodeURIComponent(token)}`, { method: "PUT", body: JSON.stringify({ installations }) });
  if (response.status !== 204) throw new Error(`The fake GitHub rejected the user (${response.status}).`);
}

// Faults this worker registered and has not cleared yet. Tests in one worker run one at a time.
const registered: { bearer: string; path: string }[] = [];

/**
 * Makes GitHub fail for one user token, for the app ("app"), or for calls made with the
 * installation token ("installation"). Every test shares the app and the installation token,
 * so for those two the path must name this test's own installation or repository.
 */
export async function failGitHub(bearer: string, fault: { path: string; status?: number; body?: unknown; close?: boolean; times?: number }) {
  const response = await fetch(`${github}/faults`, { method: "POST", body: JSON.stringify({ bearer, ...fault }) });
  if (response.status !== 204) throw new Error(`The fake GitHub rejected the fault (${response.status}).`);
  registered.push({ bearer, path: fault.path });
}

/** Removes the faults this test registered, and only those. */
export async function clearGitHubFaults() {
  for (const { bearer, path } of registered.splice(0)) {
    await fetch(`${github}/faults?bearer=${encodeURIComponent(bearer)}&path=${encodeURIComponent(path)}`, { method: "DELETE" });
  }
}

/**
 * Links a GitHub account to a test user the way a GitHub sign-in would, and returns its token.
 * The token is stored unencrypted with GitHub's prefix, which the web app reads as a legacy token.
 */
export async function linkGitHubAccount(userId: string) {
  const token = `ghu_test_${randomUUID().replaceAll("-", "")}`;
  await runTestSql(`INSERT INTO public.account (id,"accountId","providerId","userId","accessToken","createdAt","updatedAt")
    VALUES ('${randomUUID()}','${githubId()}','github','${userId}','${token}',now(),now())`);
  return token;
}

export type FakeCommit = {
  sha: string; message: string; date: string;
  /** GitHub login; null when the commit email matches no account, so the written name is used. */
  login?: string | null;
  name?: string; additions?: number; deletions?: number; files?: number;
};

export type FakeItem = {
  number: number; pull?: boolean; merged?: boolean; title: string; state: "open" | "closed";
  /** GitHub login; null for a deleted account. */
  user?: string | null;
  created_at: string; updated_at: string; closed_at?: string | null;
  /** For pull requests: totals, and the commits GitHub lists for it. */
  additions?: number; deletions?: number; changed_files?: number; commit_count?: number; commits?: FakeCommit[];
  /** For a merged pull request: its commit on the target branch, which is what a release contains. */
  merge_sha?: string;
};

export type FakeRelease = {
  tag: string; name?: string; prerelease?: boolean; published_at: string;
  /** GitHub login; null for a deleted account. */
  author?: string | null;
  /** The commit the tag points at. */
  sha: string;
  /** Commits in the release's history, besides its own. */
  contains?: string[];
  /** Commits GitHub no longer has: comparing with them answers 404. */
  unknown?: string[];
};

/** Sets the published releases GitHub has for one repository. */
export async function setGitHubReleases(repositoryId: number, releases: FakeRelease[]) {
  const response = await fetch(`${github}/repositories/${repositoryId}/releases`, { method: "PUT", body: JSON.stringify({ releases }) });
  if (response.status !== 204) throw new Error(`The fake GitHub rejected the releases (${response.status}).`);
}

/** A 40-digit commit SHA that starts with the given hex digits. */
export const sha = (start: string) => start.padEnd(40, "0");

/** Sets the commits GitHub has for one repository. */
export async function setGitHubCommits(repositoryId: number, commits: FakeCommit[]) {
  const response = await fetch(`${github}/repositories/${repositoryId}/commits`, { method: "PUT", body: JSON.stringify({ commits }) });
  if (response.status !== 204) throw new Error(`The fake GitHub rejected the commits (${response.status}).`);
}

/** Sets the issues and pull requests GitHub has for one repository. */
export async function setGitHubItems(repositoryId: number, items: FakeItem[]) {
  const response = await fetch(`${github}/repositories/${repositoryId}/items`, { method: "PUT", body: JSON.stringify({ items }) });
  if (response.status !== 204) throw new Error(`The fake GitHub rejected the items (${response.status}).`);
}

export type FakeChecks = {
  runs?: { name: string; status: "queued" | "in_progress" | "completed"; conclusion?: string | null; html_url?: string; completed_at?: string }[];
  /** GitHub's total when it is larger than the runs listed. */
  total_runs?: number;
  statuses?: { context: string; state: "success" | "failure" | "error" | "pending"; target_url?: string; updated_at?: string }[];
  /** Answer 403 for check runs, statuses, or both, as GitHub does when the app lacks the permission. */
  deny?: "runs" | "statuses" | "both";
};

/** Sets the check runs and commit statuses GitHub has for one commit. A commit without any has no checks. */
export async function setGitHubChecks(repositoryId: number, commitSha: string, checks: FakeChecks) {
  const response = await fetch(`${github}/repositories/${repositoryId}/checks/${commitSha}`, { method: "PUT", body: JSON.stringify(checks) });
  if (response.status !== 204) throw new Error(`The fake GitHub rejected the checks (${response.status}).`);
}
