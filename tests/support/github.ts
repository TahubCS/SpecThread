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

/** Makes GitHub fail for one user token, or for the app when `bearer` is "app". */
export async function failGitHub(bearer: string, fault: { path: string; status?: number; body?: unknown; close?: boolean; times?: number }) {
  const response = await fetch(`${github}/faults`, { method: "POST", body: JSON.stringify({ bearer, ...fault }) });
  if (response.status !== 204) throw new Error(`The fake GitHub rejected the fault (${response.status}).`);
}

export async function clearGitHubFaults(bearer: string) {
  await fetch(`${github}/faults?bearer=${encodeURIComponent(bearer)}`, { method: "DELETE" });
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
