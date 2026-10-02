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
