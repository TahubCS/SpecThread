/** The other requirement of a follow-up link, with who linked them and when (ADR-052). */
export type FollowUpLink = { requirementId: string; title: string; archivedAt: string | null; linkedBy: string; linkedAt: string };

/** One added or removed link. `requirementId` is the follow-up; `originalRequirementId` the requirement it follows up. */
export type FollowUpEvent = {
  id: string; requirementId: string; requirementTitle: string; originalRequirementId: string; originalTitle: string;
  action: "added" | "removed"; actor: string; occurredAt: string;
};

/** A requirement's follow-up links in both directions, and every change to them, newest first. */
export type FollowUps = { followUpOf: FollowUpLink[]; followedUpBy: FollowUpLink[]; history: FollowUpEvent[] };

export const FOLLOW_UPS_MAX = 20;

const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

function parseLink(value: unknown): FollowUpLink {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.requirementId !== "string" || typeof item.title !== "string" ||
      (item.archivedAt !== null && !isDate(item.archivedAt)) || typeof item.linkedBy !== "string" || !isDate(item.linkedAt)) {
    throw new Error("The API returned an unexpected follow-up link.");
  }
  return {
    requirementId: item.requirementId, title: item.title, archivedAt: item.archivedAt as string | null,
    linkedBy: item.linkedBy, linkedAt: item.linkedAt,
  };
}

function parseEvent(value: unknown): FollowUpEvent {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.requirementId !== "string" ||
      typeof item.requirementTitle !== "string" || typeof item.originalRequirementId !== "string" ||
      typeof item.originalTitle !== "string" || (item.action !== "added" && item.action !== "removed") ||
      typeof item.actor !== "string" || !isDate(item.occurredAt)) {
    throw new Error("The API returned an unexpected follow-up change.");
  }
  return {
    id: item.id, requirementId: item.requirementId, requirementTitle: item.requirementTitle,
    originalRequirementId: item.originalRequirementId, originalTitle: item.originalTitle, action: item.action,
    actor: item.actor, occurredAt: item.occurredAt,
  };
}

/** Validates a requirement's follow-ups from an API response. Throws when the shape is not the documented one. */
export function parseFollowUps(value: unknown): FollowUps {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || !Array.isArray(item.followUpOf) || !Array.isArray(item.followedUpBy) ||
      !Array.isArray(item.history)) {
    throw new Error("The API returned unexpected follow-ups.");
  }
  return { followUpOf: item.followUpOf.map(parseLink), followedUpBy: item.followedUpBy.map(parseLink), history: item.history.map(parseEvent) };
}

/**
 * Describes one change from the point of view of the requirement being viewed, such as
 * "Marked as a follow-up of Box opens" or "Box closes was unmarked as a follow-up of this requirement".
 */
export function followUpEventText(event: FollowUpEvent, requirementId: string): string {
  if (event.requirementId === requirementId) {
    return `${event.action === "added" ? "Marked" : "Unmarked"} as a follow-up of “${event.originalTitle}”`;
  }
  return `“${event.requirementTitle}” was ${event.action === "added" ? "marked" : "unmarked"} as a follow-up of this requirement`;
}
