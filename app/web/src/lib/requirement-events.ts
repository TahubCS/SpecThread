import { decisionText, DECISIONS, type Decision } from "./reviews";

/** What a requirement change can be (ADR-065). */
export const REQUIREMENT_EVENT_ACTIONS = ["created", "edited", "archived", "restored", "milestone_set", "milestone_cleared"] as const;
export const REQUIREMENT_CHANGES = ["title", "description", "criteria", "documents"] as const;

/**
 * One recorded change to a requirement itself (docs/API.md): who made it and when. `version` is
 * the requirement's version after the change. `changes`, on an edit, names what changed; null
 * when it was not recorded (an edit made before the record existed). `milestone` is the label set.
 */
export type RequirementEvent = {
  id: string; requirementId: string; action: (typeof REQUIREMENT_EVENT_ACTIONS)[number]; version: number | null;
  changes: (typeof REQUIREMENT_CHANGES)[number][] | null; milestone: string | null; actor: string; occurredAt: string;
};

export const AUDIT_AREAS = ["requirement", "evidence", "decision", "follow_up", "comment"] as const;

/**
 * One entry of a project's audit trail (docs/API.md): a change to a requirement, its evidence
 * links, its decisions, its follow-up links, or its comments, with who made it and when.
 */
export type AuditEntry = {
  id: string; requirementId: string; requirementTitle: string; area: (typeof AUDIT_AREAS)[number]; action: string; actor: string;
  occurredAt: string; version: number | null; changes: RequirementEvent["changes"]; milestone: string | null; label: string | null;
  title: string | null; otherRequirementTitle: string | null;
};

const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isVersion = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isInteger(value) && value > 0);
const isText = (value: unknown): value is string | null => value === null || typeof value === "string";
const isChanges = (value: unknown): value is RequirementEvent["changes"] =>
  value === null || (Array.isArray(value) && value.every(change => REQUIREMENT_CHANGES.includes(change)));

/** Validates a requirement's change record from an API response, newest first. Throws when the shape is not the documented one. */
export function parseRequirementEvents(value: unknown): RequirementEvent[] {
  if (!Array.isArray(value)) throw new Error("The API returned an unexpected change record.");
  return value.map((entry: unknown) => {
    const item = entry as Record<string, unknown> | null;
    if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.requirementId !== "string" ||
        !REQUIREMENT_EVENT_ACTIONS.includes(item.action as RequirementEvent["action"]) || !isVersion(item.version) ||
        !isChanges(item.changes) || !isText(item.milestone) || typeof item.actor !== "string" || !isDate(item.occurredAt)) {
      throw new Error("The API returned an unexpected change record.");
    }
    return {
      id: item.id, requirementId: item.requirementId, action: item.action as RequirementEvent["action"], version: item.version,
      changes: item.changes, milestone: item.milestone, actor: item.actor, occurredAt: item.occurredAt,
    };
  });
}

/** Validates a project's audit trail from an API response, newest first. Throws when the shape is not the documented one. */
export function parseAuditTrail(value: unknown): AuditEntry[] {
  if (!Array.isArray(value)) throw new Error("The API returned an unexpected audit trail.");
  return value.map((entry: unknown) => {
    const item = entry as Record<string, unknown> | null;
    if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.requirementId !== "string" ||
        typeof item.requirementTitle !== "string" || !AUDIT_AREAS.includes(item.area as AuditEntry["area"]) ||
        typeof item.action !== "string" || typeof item.actor !== "string" || !isDate(item.occurredAt) || !isVersion(item.version) ||
        !isChanges(item.changes) || !isText(item.milestone) || !isText(item.label) || !isText(item.title) ||
        !isText(item.otherRequirementTitle)) {
      throw new Error("The API returned an unexpected audit trail.");
    }
    return {
      id: item.id, requirementId: item.requirementId, requirementTitle: item.requirementTitle, area: item.area as AuditEntry["area"],
      action: item.action, actor: item.actor, occurredAt: item.occurredAt, version: item.version, changes: item.changes,
      milestone: item.milestone, label: item.label, title: item.title, otherRequirementTitle: item.otherRequirementTitle,
    };
  });
}

const changeText: Record<(typeof REQUIREMENT_CHANGES)[number], string> = {
  title: "title", description: "description", criteria: "acceptance criteria", documents: "linked documents",
};

function list(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Says what a requirement change was, such as "Edited the title and acceptance criteria (version 3)". */
export function requirementEventText(event: Pick<RequirementEvent, "action" | "version" | "changes" | "milestone">): string {
  const version = event.version === null ? "" : ` (version ${event.version})`;
  switch (event.action) {
    case "created": return "Created the requirement";
    case "edited":
      if (event.changes === null) return `Saved version ${event.version ?? "?"}; what changed was not recorded`;
      if (event.changes.length === 0) return `Saved without changes${version}`;
      return `Edited the ${list(event.changes.map(change => changeText[change]))}${version}`;
    case "archived": return "Archived the requirement";
    case "restored": return "Restored the requirement";
    case "milestone_set": return `Set the milestone to “${event.milestone ?? ""}”`;
    case "milestone_cleared": return "Cleared the milestone";
  }
}

const evidenceText: Record<string, string> = {
  added: "Linked", removed: "Removed", confirmed: "Confirmed suggestion", rejected: "Rejected suggestion",
  moved_in: "Moved in", moved_out: "Moved out",
};

/** Says what one audit trail entry was, in the same words the requirement's pages use. */
export function auditEntryText(entry: AuditEntry): string {
  switch (entry.area) {
    case "requirement":
      return requirementEventText({ ...entry, action: entry.action as RequirementEvent["action"] });
    case "evidence": {
      const item = `${entry.label ?? ""} “${entry.title ?? ""}”`.trim();
      const verb = evidenceText[entry.action] ?? entry.action;
      if (entry.action === "moved_in") return `Moved ${item} here from “${entry.otherRequirementTitle ?? "another requirement"}”`;
      if (entry.action === "moved_out") return `Moved ${item} to “${entry.otherRequirementTitle ?? "another requirement"}”`;
      return `${verb} ${item}`;
    }
    case "decision":
      return DECISIONS.includes(entry.action as Decision)
        ? `Recorded “${decisionText[entry.action as Decision]}”${entry.version === null ? "" : ` on version ${entry.version}`}`
        : "Recorded a decision";
    case "follow_up":
      return entry.action === "removed"
        ? `Removed the follow-up of “${entry.otherRequirementTitle ?? "another requirement"}”`
        : `Marked as a follow-up of “${entry.otherRequirementTitle ?? "another requirement"}”`;
    case "comment":
      return entry.action === "edited" ? "Edited a comment" : entry.action === "deleted" ? "Deleted a comment" : "Posted a comment";
  }
}

export const auditAreaText: Record<AuditEntry["area"], string> = {
  requirement: "Requirement", evidence: "Evidence", decision: "Decision", follow_up: "Follow-up", comment: "Comment",
};
