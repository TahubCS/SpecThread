# SpecThread API for the web app

The ASP.NET Core API in app/api owns product data and its rules (ADR-002, ADR-040).
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
to the project's team; non-members get 404 as if the project did not exist.

| Method | Path | Who | Body | Success |
|---|---|---|---|---|
| GET | `/projects` | any user | | 200 `Project[]` (active only, by name) |
| POST | `/projects` | team Owner/Admin with completed onboarding | `{ name, teamId }` | 201 `Project` in that team |
| GET | `/projects/{projectId}` | member | | 200 `Project` (archived included) |
| PATCH | `/projects/{projectId}` | team Owner/Admin | `{ name }` | 200 `Project` |
| POST | `/projects/{projectId}/archive` | team Owner/Admin | | 200 `Project` (idempotent) |
| POST | `/projects/{projectId}/restore` | team Owner/Admin | | 200 `Project` (idempotent) |
| GET | `/teams/{teamId}/projects` | team member | query `archived=true` for archive; default false | 200 `Project[]`, by name then ID |
| GET | `/projects/{projectId}/requirements` | member | | 200 `RequirementSummary[]` (active only, oldest first) |
| POST | `/projects/{projectId}/requirements` | member | `{ title, description?, acceptanceCriteria? }` | 201 `Requirement` |
| GET | `/requirements/{requirementId}` | member | | 200 `Requirement` |
| PUT | `/requirements/{requirementId}` | member | `{ title, description?, acceptanceCriteria?, version }` | 200 `Requirement` |
| POST | `/requirements/{requirementId}/archive` | member | | 200 `Requirement` (idempotent) |
| GET | `/projects/{projectId}/members` | member | | 200 `ProjectMember[]` (owner first, then by name) |
| POST | `/projects/{projectId}/members` | member | | 410 (retired) |
| DELETE | `/projects/{projectId}/members/{userId}` | member | | 410 (retired) |

| POST | `/github/repositories` | any user | `{ githubToken }` | 200 `{ installUrl, repositories: AvailableRepository[], truncated }` |
| GET | `/projects/{projectId}/repository` | member | | 200 `{ repository: ProjectRepository \| null }` |
| PUT | `/projects/{projectId}/repository` | owner | `{ installationId, repositoryId, githubToken }` | 200 `{ repository: ProjectRepository }` |
| DELETE | `/projects/{projectId}/repository` | owner | | 204 (idempotent) |

| GET | `/requirements/{requirementId}/evidence` | member | | 200 `Evidence[]` (oldest first by GitHub's created time) |
| POST | `/requirements/{requirementId}/evidence` | member | `{ reference }` | 201 `Evidence` |
| POST | `/requirements/{requirementId}/evidence/refresh` | member | | 200 `Evidence[]` |
| DELETE | `/requirements/{requirementId}/evidence/{evidenceId}` | member | | 204 |
| GET | `/requirements/{requirementId}/reviews` | member | | 200 `Review[]` (newest first) |
| POST | `/requirements/{requirementId}/reviews` | member, not the requirement's author | `{ decision, note?, version }` | 201 `Review` |

`reference` is an issue or pull request number (`42` or `#42`), a commit SHA of 7 to
40 hex digits, a release tag, or the github.com address of any of them, in the
project's connected repository (ADR-033, ADR-034, ADR-037). It is read in that order:
digits alone are a number, 7 to 40 hex digits are a SHA, and any other text without
spaces is a release tag, so a tag that looks like a number or a SHA must be given as
its release address. The API reads the
item from GitHub before saving. Unknown items and links to another repository are 400
on `reference`. Refresh re-reads issues, pull requests, and releases, the check
results of pull requests and commits (ADR-035), and what each release contains; a
commit itself is not re-read. `source` in the
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
Every team member can read every project and edit its requirements. Only the team
Owner/Admin manage projects. `teamId` is required on creation and immutable on
rename. Missing/empty IDs return 400 field errors; unknown/inaccessible teams return
404, and a regular team Member receives 403. Project membership reads reflect team
members. Legacy POST/DELETE membership routes return 410 with
`code: "team_membership_required"` after membership checking; outsiders still receive
404. These routes never add or remove a team member. Joins require invitation acceptance.

`PUT` replaces the requirement: send the full criteria list in display order (omitting it
clears the criteria) and the `version` you loaded. Criteria get new IDs on every save.

## Shapes

```ts
type Project = {
  id: string; name: string; ownerUserId: string; createdAt: string; archivedAt: string | null;
  teamId: string; teamName: string; teamRole: "owner" | "admin" | "member"; requirementCount: number;
};
type RequirementSummary = {
  id: string; projectId: string; title: string; version: number;
  createdAt: string; updatedAt: string; archivedAt: string | null;
  // How many evidence links of any kind the requirement has. Only on the list.
  evidenceCount: number;
  // The latest decision, or null. Only on the list; a requirement's page reads /reviews.
  review: { decision: Decision; decidedBy: string; decidedAt: string; outdated: boolean } | null;
};
type Decision = "accepted" | "rejected" | "more_evidence";
type Review = {
  id: string; requirementId: string; decision: Decision; note: string;
  requirementVersion: number; // the version the reviewer saw
  // The evidence links as they were when the decision was made. label is "#9", a short SHA, or a tag.
  evidence: { id: string; kind: string; label: string; title: string; state: string | null }[];
  decidedBy: string; decidedAt: string;
};
type Requirement = Omit<RequirementSummary, "review" | "evidenceCount"> & {
  description: string; createdBy: string;
  acceptanceCriteria: { id: string; text: string; position: number }[];
};
type ProjectMember = { userId: string; name: string; email: string; joinedAt: string; isOwner: boolean; role: "owner" | "admin" | "member" };
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
  id: string; requirementId: string; kind: "issue" | "pull_request" | "commit" | "release";
  number: number | null;                        // issues and pull requests
  state: "open" | "closed" | "merged" | null;   // issues and pull requests
  sha: string | null;                           // a commit, a pull request's latest commit, or a release's tagged commit
  tag: string | null; prerelease: boolean | null; // releases
  // Releases: evidence ID of each compared commit or merged pull request -> whether the release's history includes it.
  // A linked change with no entry was not compared (an unmerged pull request, or one from another repository).
  contains: Record<string, boolean> | null;
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

Review decisions (ADR-038): `note` may have up to 2,000 characters and is required
for `rejected` and `more_evidence`. `version` is the requirement version the
reviewer was shown; any other current version is refused with 409. The requirement's
author gets 403, and an archived requirement or project 409. Decisions are only
added: there is no update or delete. A decision is `outdated` when the requirement's
version, or the set of its evidence link IDs, differs from what was reviewed;
refreshing evidence does not change that.
```

`ownerUserId` on Project is retained historical creator provenance. Use `teamRole`
for management controls; project creation does not grant independent ownership.
`requirementCount` counts active requirements.

Timestamps are ISO 8601 UTC strings. Text is trimmed before saving.

## Errors

Errors are problem details (`application/problem+json`) with `title`, `status`, and `detail`.

| Status | Meaning | Suggested UI |
|---|---|---|
| 400 | Validation failed; `errors` maps fields such as `title` or `acceptanceCriteria[2]` to messages | Show the messages next to the fields |
| 401 | Missing or invalid token | Send the user to sign in |
| 403 | Insufficient team role, a decision by the requirement's author, or the account record is missing | Show the `detail` |
| 404 | Not found, or not a member | Show a not-found state |
| 409 | Archived item, stale `version`, or onboarding required | Reload, or finish onboarding |
| 410 | Individual project membership writes retired | Manage membership through the team |

Limits: project names and requirement titles 1-200 characters, descriptions up to 10,000,
up to 50 acceptance criteria of 1-2,000 characters each, and emails up to 254 characters.

## Teams navigation and onboarding (ADR-039/040)

| Method | Path | Who | Body | Success |
|---|---|---|---|---|
| GET | `/teams` | any user | | 200 `Team[]`, only the caller's memberships, by name then ID |
| POST | `/teams` | existing account | `{ name, description? }` | 201 `Team`; caller is the sole owner and first member |
| GET | `/teams/{teamId}` | team member | | 200 `Team`; missing and inaccessible teams both return 404 |
| PATCH | `/teams/{teamId}` | Owner/Admin | `{ name, description? }` | 200 `Team` |
| GET | `/teams/{teamId}/members` | team member | | 200 `TeamMember[]`, Owner first, then name and user ID |
| PATCH | `/teams/{teamId}/members/{userId}` | Owner | `{ role: "admin" \| "member" }` | 200 `TeamMember` |
| DELETE | `/teams/{teamId}/members/{userId}` | permitted manager, or that user leaving | | 204 |
| POST | `/teams/{teamId}/ownership` | Owner | `{ userId }` existing other member | 200 `Team`; previous Owner is now Admin |
| PATCH | `/teams/{teamId}/preferences` | team member | `{ isFavorite?, isExpanded? }` | 200 `Team`; affects only the caller's membership |
| GET | `/onboarding` | existing account | | 200 `{ completed: boolean }` |
| POST | `/onboarding` | incomplete existing account | `{ name, description? }` | 201 `Team`; saves initial team and completion atomically |

```ts
type Team = {
  id: string; name: string; description: string; ownerUserId: string;
  createdAt: string; role: "owner" | "admin" | "member"; memberCount: number;
  isFavorite: boolean; isExpanded: boolean;
};
type TeamMember = {
  userId: string; name: string; email: string;
  role: "owner" | "admin" | "member"; joinedAt: string;
};
```

Creation saves the team, its owner's membership, and initial onboarding completion
when needed in one transaction. The request
cannot set ownership or a role. Names use the existing 1-200-character limit;
descriptions are optional, trimmed, and up to 10,000 characters. An absent description
is stored as an empty string. A token with no account row receives 403 on creation.
Validation uses the same 400 field-error format as projects. Timestamps retain the
PostgreSQL precision used by the other write endpoints.

`role` is relative to the caller. A single `ownerUserId` determines ownership;
non-owner membership roles are `admin` or `member`. Only the Owner appoints or demotes Admins. Admins remove regular Members; only the
Owner removes Admins. Any non-owner can leave voluntarily. Nobody removes the Owner
or changes their membership role (409); transfer ownership first. Transfer selects
any existing other member and makes the previous Owner an Admin. These mutations
lock the team row and recheck membership within a transaction, so concurrent
removal/promotion/transfer cannot orphan ownership or evade role restrictions.
There is no immediate-add endpoint; joining requires invitation acceptance. Team membership grants
access to all projects and requirements inside the team.

Next.js uses server-only `apiFetch` for all team reads and creation. The browser's
same-origin `GET /api/teams` checks the session and proxies the membership list for
the sidebar; `PATCH /api/teams/{id}/preferences` checks the session and forwards
only personal preference fields. Neither exposes a JWT. The create form uses an authenticated server
action. Team routes require a session and real membership, including planned sections.

Initial onboarding returns 409 if already completed or if a concurrent first-team
request won. Failed validation never completes it. The unique completion key prevents
two concurrent initial-team writes from both succeeding. GET completion persists even
when the caller no longer has a membership. The proxy redirects incomplete accounts
from protected pages to /onboarding, and POST /projects returns 409 with
`code: "onboarding_required"` for an incomplete existing account. Anonymous requests
remain 401, and an account without a user row remains 403. Project access follows the containing team as described above.

Not yet available: activity and audit history. Claude owns global
project pages and creation/deletion forms; this branch implements team tables and
the C# access contract.


Team management uses authenticated server actions. Role changes require explicit
Save in a row; removal and leave require a named native confirmation dialog. Team
settings is one page with name/description, ownership transfer, and Leave team.
Member accounts see general settings as read-only. Transfer confirmation names the
team and recipient and explains the previous Owner becomes an Admin. Leaving opens
Teams and preserves onboarding completion. Menus/headers refresh after changes.
The team archive offers Owner/Admin Restore buttons with confirmation naming the
project and team. The server action validates project/team scope before calling
the existing restore endpoint, which rechecks current permissions. Members can
view the archive but have no restore controls. Restoration refreshes the archive
and active-project lists.

## Team invitations (ADR-040)

| Method | Path | Who | Body | Success |
|---|---|---|---|---|
| GET | `/teams/{teamId}/invitations` | Owner/Admin | | 200 `Invitation[]`, all statuses, newest first |
| POST | `/teams/{teamId}/invitations` | permitted manager | `{ email, role: "admin" \| "member" }` | 201 `{ invitation, token, teamName }` |
| POST | `/teams/{teamId}/invitations/{invitationId}/resend` | permitted manager | | 200 `{ invitation, token, teamName }`, fresh link |
| DELETE | `/teams/{teamId}/invitations/{invitationId}` | permitted manager | | 204, idempotent revocation |
| GET | `/invites/{token}` | public | | 200 `InvitationPreview`; invalid/replaced/unknown token 404 |
| POST | `/invites/{token}/accept` | verified matching account | | 200 `Team`, joins and completes onboarding atomically |

```ts
type InvitationStatus = "pending" | "accepted" | "revoked" | "expired" | "unavailable";
type Invitation = {
  id: string; teamId: string; email: string; role: "admin" | "member";
  inviterName: string; createdAt: string; issuedAt: string; expiresAt: string;
  status: InvitationStatus;
};
type InvitationPreview = {
  teamId: string; teamName: string; inviterName: string; email: string;
  role: "admin" | "member"; expiresAt: string; status: InvitationStatus;
};
```

Owners manage Admin and Member invitations; Admins manage Member invitations only.
Members receive 403 on management; inaccessible teams and cross-team invitation IDs
return 404. Email is trimmed/lowercased and limited to 254 characters. Existing
members and duplicate unresolved invitations receive 409; resend an expired one.
Creating an invitation adds no membership. The secret is 32 random bytes, returned
as 64 hex characters only when issued; the database stores only its SHA-256 hash.
Links expire after seven days. Resend replaces the secret and issuer and renews
expiry, immediately invalidating the previous link. Accepted or revoked invitations
cannot be resent (409); create a new invitation when needed.

Acceptance requires both a verified account with the matching email and the
inviter's current permission. An Admin invitation requires its inviter to still be
the Owner. Lost permission yields `unavailable`; an authorized manager can resend.
Expired, revoked, and permission-invalid acceptance returns 410. Wrong/unverified
accounts return 403. All writes lock the same team row as membership/ownership
changes. Membership, token consumption, and completion commit together. Simultaneous
acceptances in different teams share an idempotent completion UPSERT. Repeated
acceptance by the same still-present member succeeds; a consumed link cannot rejoin
someone who left or was removed (409). Existing memberships retain their role.

The web offers an Invite people dialog from Members, email delivery through the
existing sender, and immediate Copy link. Email failure leaves the issued invitation
usable and offers copying/resending. The secret is not recoverable from the list;
resend issues a fresh link. Management uses a separate table and named revoke
confirmation. The acceptance screen is a focused full page. Exact 64-hex preview
URLs (and their legacy `/expired` redirect) are public; all other invitation paths
retain the deny-by-default gate. Sign-in/signup/verification preserve the invitation
destination. A preview alone never completes onboarding or unlocks project creation.
Preview responses disable caching, and the page sets `no-referrer`/no indexing.
API hosting request-start/finish logs are filtered below Warning because those
framework messages include raw token URLs. Production proxy logs must also avoid
recording invitation secrets. Project management writes share the team transaction
lock with role/removal/transfer changes and construct their response before commit,
so concurrent revocation cannot commit a write and then fail its membership read.
