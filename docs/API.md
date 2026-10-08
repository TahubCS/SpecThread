# SpecThread API for the web app

The ASP.NET Core API in app/api owns product data and its rules (ADR-002, ADR-024).
This page summarizes the contract. The authoritative schema is the OpenAPI document,
served in Development at `/openapi/v1.json`.

## Calling the API from Next.js

Call it from server code only (server components, server actions, route handlers):

```ts
import { apiFetch } from "@/lib/api";

const response = await apiFetch("/projects");
if (!response.ok) { /* handle 400, 403, 404, 409 below */ }
const projects: Project[] = await response.json();

await apiFetch(`/projects/${projectId}/requirements`, {
  method: "POST",
  body: JSON.stringify({ title, description, acceptanceCriteria }),
});
```

`apiFetch` exchanges the user's Better Auth session for a short-lived JWT and sends it
as `Authorization: Bearer <token>`. It needs `SPECTHREAD_API_URL` (server-only; see
app/web/.env.example). For local development run the API with
`dotnet run --project app/api --urls http://localhost:5000`, with `Auth__Issuer` set to
the web origin (`http://localhost:3000`) and `ConnectionStrings__Database` configured
(docs/DATABASE.md). Do not call the API from client components; there is no CORS.

## Endpoints

All endpoints require a signed-in user (401 otherwise). "Member" means the user belongs
to the project; non-members get 404 as if the project did not exist.

| Method | Path | Who | Body | Success |
|---|---|---|---|---|
| GET | `/projects` | any user | | 200 `Project[]` (active only, by name) |
| POST | `/projects` | any user | `{ name }` | 201 `Project`; caller becomes owner and member |
| GET | `/projects/{projectId}` | member | | 200 `Project` (archived included) |
| PATCH | `/projects/{projectId}` | owner | `{ name }` | 200 `Project` |
| POST | `/projects/{projectId}/archive` | owner | | 200 `Project` (idempotent) |
| GET | `/projects/{projectId}/requirements` | member | | 200 `RequirementSummary[]` (active only, oldest first) |
| POST | `/projects/{projectId}/requirements` | member | `{ title, description?, acceptanceCriteria? }` | 201 `Requirement` |
| GET | `/requirements/{requirementId}` | member | | 200 `Requirement` |
| PUT | `/requirements/{requirementId}` | member | `{ title, description?, acceptanceCriteria?, version }` | 200 `Requirement` |
| POST | `/requirements/{requirementId}/archive` | member | | 200 `Requirement` (idempotent) |
| GET | `/projects/{projectId}/members` | member | | 200 `ProjectMember[]` (owner first, then by name) |
| POST | `/projects/{projectId}/members` | owner | `{ email }` | 201 `ProjectMember` |
| DELETE | `/projects/{projectId}/members/{userId}` | owner, or that member leaving | | 204 |

| POST | `/github/repositories` | any user | `{ githubToken }` | 200 `{ installUrl, repositories: AvailableRepository[], truncated }` |
| GET | `/projects/{projectId}/repository` | member | | 200 `{ repository: ProjectRepository \| null }` |
| PUT | `/projects/{projectId}/repository` | owner | `{ installationId, repositoryId, githubToken }` | 200 `{ repository: ProjectRepository }` |
| DELETE | `/projects/{projectId}/repository` | owner | | 204 (idempotent) |

| GET | `/requirements/{requirementId}/evidence` | member | | 200 `Evidence[]` (oldest first by GitHub's created time) |
| POST | `/requirements/{requirementId}/evidence` | member | `{ reference }` | 201 `Evidence` |
| POST | `/requirements/{requirementId}/evidence/refresh` | member | | 200 `Evidence[]` |
| DELETE | `/requirements/{requirementId}/evidence/{evidenceId}` | member | | 204 |

`reference` is an issue or pull request number (`42` or `#42`), a commit SHA of 7 to
40 hex digits, or the github.com address of any of them, in the project's connected
repository (ADR-033, ADR-034). Digits alone are read as a number. The API reads the
item from GitHub before saving. Unknown items and links to another repository are 400
on `reference`. Refresh re-reads issues and pull requests, and the check results of
pull requests and commits (ADR-035); a commit itself is not re-read. `source` in the
request is ignored: links made through this endpoint are always `manual` (ADR-036).
409 carries the reason in `detail`: already linked, 50 links reached, no repository
connected, the app uninstalled, or an archived requirement or project. 502 and 503
mean the same as for repositories.

`githubToken` is the signed-in user's own GitHub token for the SpecThread GitHub App
(ADR-032). In the web app use `gitHubAccess()` from `@/lib/github-data`; never send
the token to the browser. The API uses it for that request only. A token GitHub
rejects is 400 on `githubToken`; a repository GitHub does not show that user through
that installation is 400 on `repositoryId`; an installation the app can no longer act
on is 400 on `installationId`. GitHub being unreachable is 502. Missing or rejected
app credentials are 503.

Adding a member needs the email of an existing SpecThread account with a verified
address. The match ignores case. Otherwise the response is 400 with an error on `email`.
Adding someone who is already a member returns 409. The owner can't be removed (409).
A member who removes themselves loses access immediately.

`PUT` replaces the requirement: send the full criteria list in display order (omitting it
clears the criteria) and the `version` you loaded. Criteria get new IDs on every save.

## Shapes

```ts
type Project = { id: string; name: string; ownerUserId: string; createdAt: string; archivedAt: string | null };
type RequirementSummary = {
  id: string; projectId: string; title: string; version: number;
  createdAt: string; updatedAt: string; archivedAt: string | null;
};
type Requirement = RequirementSummary & {
  description: string; createdBy: string;
  acceptanceCriteria: { id: string; text: string; position: number }[];
};
type ProjectMember = { userId: string; name: string; email: string; joinedAt: string; isOwner: boolean };
type AvailableRepository = {
  installationId: number; repositoryId: number; owner: string; name: string; fullName: string; isPrivate: boolean;
};
type ProjectRepository = AvailableRepository & { url: string; connectedBy: string; connectedAt: string };
type EvidenceCommit = { sha: string; message: string; author: string | null; date: string; url: string };
type EvidenceCheck = {
  name: string; result: "passed" | "failed" | "running" | "skipped" | "cancelled" | "neutral";
  url: string | null;          // only when the check has a page on github.com
  completedAt: string | null; kind: "check" | "status";
};
type Evidence = {
  id: string; requirementId: string; kind: "issue" | "pull_request" | "commit";
  number: number | null;                        // issues and pull requests
  state: "open" | "closed" | "merged" | null;   // issues and pull requests
  sha: string | null;                           // a commit, or a pull request's latest commit
  title: string; author: string | null; url: string; repository: string;
  additions: number | null; deletions: number | null; changedFiles: number | null; // pull requests and commits
  commitCount: number | null; commits: EvidenceCommit[] | null;                    // pull requests (first 100 commits)
  // Pull requests (latest commit) and commits. checks is null when GitHub would not let them be read;
  // checkCount is GitHub's total and may exceed the 100 stored. All three are null for issues.
  checks: EvidenceCheck[] | null; checkCount: number | null; checksReadAt: string | null;
  source: "manual" | "suggested"; // linkedBy is the person who added or confirmed the link
  githubCreatedAt: string; githubUpdatedAt: string; githubClosedAt: string | null;
  linkedBy: string; linkedAt: string; refreshedAt: string;
};
```

Timestamps are ISO 8601 UTC strings. Text is trimmed before saving.

## Errors

Errors are problem details (`application/problem+json`) with `title`, `status`, and `detail`.

| Status | Meaning | Suggested UI |
|---|---|---|
| 400 | Validation failed; `errors` maps fields such as `title` or `acceptanceCriteria[2]` to messages | Show the messages next to the fields |
| 401 | Missing or invalid token | Send the user to sign in |
| 403 | Owner-only action (including removing another member), or the account record is missing | Explain that only the owner can do this |
| 404 | Not found, or not a member | Show a not-found state |
| 409 | Archived item, stale `version`, duplicate member, or removing the owner | Offer to reload |

Limits: project names and requirement titles 1-200 characters, descriptions up to 10,000,
up to 50 acceptance criteria of 1-2,000 characters each, and emails up to 254 characters.

Not yet available: invitations for people without an account, ownership transfer, teams,
unarchiving, and audit history.
