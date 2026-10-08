export type TeamRole = "owner" | "admin" | "member";

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
      typeof team.role !== "string" || !["owner", "admin", "member"].includes(team.role) ||
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

export const teamRoleLabels: Record<TeamRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };

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
        typeof member.email !== "string" || typeof member.role !== "string" ||
        !["owner", "admin", "member"].includes(member.role) ||
        typeof member.joinedAt !== "string" || !Number.isFinite(Date.parse(member.joinedAt)))
      throw new Error("Invalid member response.");
    return member as TeamMember;
  });
}
