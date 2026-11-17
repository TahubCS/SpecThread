export type TeamRole = "owner" | "admin" | "member" | "reviewer" | "observer";
/** Roles an invitation or a role change can give; Owner only comes from transferring ownership. */
export type AssignableRole = Exclude<TeamRole, "owner">;
export const teamRoles: readonly TeamRole[] = ["owner", "admin", "member", "reviewer", "observer"];
export const assignableRoles: readonly AssignableRole[] = ["admin", "member", "reviewer", "observer"];

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (teamRoles as readonly string[]).includes(value);
}
export function isAssignableRole(value: unknown): value is AssignableRole {
  return typeof value === "string" && (assignableRoles as readonly string[]).includes(value);
}

/**
 * What a team role may do (ADR-058). The API enforces each rule; these only decide which controls
 * to show. Every role reads the team's projects, requirements, evidence, and decisions.
 */
export const canManageTeam = (role: TeamRole) => role === "owner" || role === "admin";
/** Create, edit, archive, and restore requirements and documents, and change their links. */
export const canEdit = (role: TeamRole) => role === "owner" || role === "admin" || role === "member";
/** Record review decisions: everyone except Observers. */
export const canReview = (role: TeamRole) => role !== "observer";
/** The roles a manager may invite: the Owner any, an Admin every role except Admin. */
export const invitableRoles = (role: TeamRole): AssignableRole[] =>
  role === "owner" ? [...assignableRoles] : role === "admin" ? assignableRoles.filter(r => r !== "admin") : [];

export const roleDescriptions: Record<AssignableRole, string> = {
  admin: "Manages the team, its projects, and invitations, and works on requirements.",
  member: "Works on requirements, links evidence, and records decisions.",
  reviewer: "Reads everything and records decisions, but can't edit requirements or links.",
  observer: "Reads everything, but can't change anything or record decisions.",
};

export type Team = {
  id: string;
  name: string;
  description: string;
  ownerUserId: string;
  createdAt: string;
  role: TeamRole;
  memberCount: number;
  isFavorite: boolean;
  isExpanded: boolean;
};

/** Checks the API boundary before using IDs in navigation or showing team data. */
export function parseTeam(value: unknown): Team {
  if (!value || typeof value !== "object") throw new Error("Invalid team response.");
  const team = value as Record<string, unknown>;
  if (typeof team.id !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(team.id) ||
      typeof team.name !== "string" || !team.name.trim() || typeof team.description !== "string" ||
      typeof team.ownerUserId !== "string" || !team.ownerUserId ||
      typeof team.createdAt !== "string" || !Number.isFinite(Date.parse(team.createdAt)) ||
      !isTeamRole(team.role) ||
      typeof team.memberCount !== "number" || !Number.isInteger(team.memberCount) || team.memberCount < 1 ||
      typeof team.isFavorite !== "boolean" || typeof team.isExpanded !== "boolean") {
    throw new Error("Invalid team response.");
  }
  return team as Team;
}

/** Parses a team list; malformed responses never become navigation links. */
export function parseTeams(value: unknown): Team[] {
  if (!Array.isArray(value)) throw new Error("Invalid teams response.");
  return value.map(parseTeam);
}

export const teamRoleLabels: Record<TeamRole, string> = { owner: "Owner", admin: "Admin", member: "Member", reviewer: "Reviewer", observer: "Observer" };

export function parseOnboarding(value: unknown): { completed: boolean } {
  if (!value || typeof value !== "object" || !("completed" in value) || typeof value.completed !== "boolean")
    throw new Error("Invalid onboarding response.");
  return { completed: value.completed };
}

export type TeamMember = { userId: string; name: string; email: string; role: TeamRole; joinedAt: string };

export function parseTeamMembers(value: unknown): TeamMember[] {
  if (!Array.isArray(value)) throw new Error("Invalid members response.");
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid member response.");
    const member = item as Record<string, unknown>;
    if (typeof member.userId !== "string" || !member.userId || typeof member.name !== "string" ||
        typeof member.email !== "string" || !isTeamRole(member.role) ||
        typeof member.joinedAt !== "string" || !Number.isFinite(Date.parse(member.joinedAt)))
      throw new Error("Invalid member response.");
    return member as TeamMember;
  });
}
