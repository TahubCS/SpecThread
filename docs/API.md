# SpecThread API for the web app

The ASP.NET Core API in app/api owns product data and its rules (ADR-002, ADR-027).
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
};
type Requirement = RequirementSummary & {
  description: string; createdBy: string;
  acceptanceCriteria: { id: string; text: string; position: number }[];
};
type ProjectMember = { userId: string; name: string; email: string; joinedAt: string; isOwner: boolean; role: "owner" | "admin" | "member" };
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
| 403 | Insufficient team role, or the account record is missing | Explain the required role |
| 404 | Not found, or not a member | Show a not-found state |
| 409 | Archived item, stale `version`, or onboarding required | Reload, or finish onboarding |
| 410 | Individual project membership writes retired | Manage membership through the team |

Limits: project names and requirement titles 1-200 characters, descriptions up to 10,000,
up to 50 acceptance criteria of 1-2,000 characters each, and emails up to 254 characters.

## Teams navigation and onboarding (ADR-026/027)

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

## Team invitations (ADR-027)

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
