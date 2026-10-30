import type { ProjectDocument } from "./documents";
import { isLabel, optionalField, type RequirementSummary } from "./projects";
import { isVersion } from "./reviews";

/** A project document a requirement links to. It stays linked after it is archived (ADR-049). */
export type LinkedDocument = {
  id: string; title: string; fileName: string; contentType: string; archivedAt: string | null; linkedBy: string; linkedAt: string;
};

/** A requirement with its description, ordered acceptance criteria, and linked documents (docs/API.md). */
export type Requirement = Omit<RequirementSummary, "review" | "evidenceCount" | "evidenceComplete"> & {
  description: string;
  createdBy: string;
  /** Who saved the current version (the creator until someone edits it). */
  updatedBy: string;
  acceptanceCriteria: { id: string; text: string; position: number }[];
  documents: LinkedDocument[];
};

export const REQUIREMENT_TITLE_MAX = 200;
export const REQUIREMENT_DESCRIPTION_MAX = 10_000;
export const CRITERIA_MAX = 50;
export const CRITERION_MAX = 2_000;
export const REQUIREMENT_DOCUMENTS_MAX = 20;
export const MILESTONE_MAX = 100;

/** Returns the list with the item at `from` moved to `to`, or the same list when either position does not exist. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const valid = (index: number) => Number.isInteger(index) && index >= 0 && index < list.length;
  if (!valid(from) || !valid(to) || from === to) return list;
  const result = [...list];
  result.splice(to, 0, ...result.splice(from, 1));
  return result;
}

/** A document the requirement form offers to link. */
export type DocumentChoice = { id: string; title: string; contentType: string; archived: boolean };

/**
 * The documents a requirement form offers: the project's active ones, then any linked ones that
 * have been archived since, which stay linked unless unticked but can't be linked again.
 */
export function documentChoices(active: Pick<ProjectDocument, "id" | "title" | "contentType">[], linked: LinkedDocument[]): DocumentChoice[] {
  const choices = active.map(({ id, title, contentType }) => ({ id, title, contentType, archived: false }));
  const offered = new Set(choices.map(choice => choice.id));
  for (const document of linked) {
    if (document.archivedAt && !offered.has(document.id)) {
      choices.push({ id: document.id, title: document.title, contentType: document.contentType, archived: true });
    }
  }
  return choices;
}

/** What a user enters for a requirement. `criteria` is in display order; `milestone` is only entered when creating one. */
export type RequirementInput = { title: string; description: string; criteria: string[]; documentIds: string[]; milestone?: string };

/** Messages for a rejected requirement. `items` maps a criterion's position to its message. */
export type RequirementErrors = {
  title?: string;
  description?: string;
  criteria?: string;
  documents?: string;
  milestone?: string;
  items: Record<number, string>;
  form?: string;
};

/**
 * Validates one requirement from an API response. Throws when the shape is not the documented one.
 * Vercel deploys the web before CI deploys the API (ADR-044), so a response from the previous
 * API may lack `updatedBy`, `documents`, `criteriaVersion`, and `milestone`: they read as the
 * creator, no documents, no recorded criteria version, and no milestone.
 */
export function parseRequirement(value: unknown): Requirement {
  const item = value as Record<string, unknown> | null;
  const isDate = (date: unknown) => typeof date === "string" && !Number.isNaN(Date.parse(date));
  const criteria = item?.acceptanceCriteria;
  const documents = item?.documents === undefined ? [] : item.documents;
  const updatedBy = item?.updatedBy === undefined ? item?.createdBy : item.updatedBy;
  const criteriaVersion = optionalField(item?.criteriaVersion, isVersion);
  const milestone = optionalField(item?.milestone, isLabel);
  if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.projectId !== "string" ||
      typeof item.title !== "string" || typeof item.description !== "string" || typeof item.createdBy !== "string" || typeof updatedBy !== "string" ||
      typeof item.version !== "number" || !isDate(item.createdAt) || !isDate(item.updatedAt) ||
      (item.archivedAt !== null && typeof item.archivedAt !== "string") || !Array.isArray(criteria) || !Array.isArray(documents) ||
      criteriaVersion === undefined || milestone === undefined) {
    throw new Error("The API returned an unexpected requirement.");
  }
  return {
    id: item.id, projectId: item.projectId, title: item.title, description: item.description, createdBy: item.createdBy,
    updatedBy, criteriaVersion, milestone,
    version: item.version, createdAt: item.createdAt as string, updatedAt: item.updatedAt as string, archivedAt: item.archivedAt,
    acceptanceCriteria: criteria.map((entry: unknown) => {
      const criterion = entry as Record<string, unknown> | null;
      if (typeof criterion !== "object" || criterion === null || typeof criterion.id !== "string" ||
          typeof criterion.text !== "string" || typeof criterion.position !== "number") {
        throw new Error("The API returned an unexpected acceptance criterion.");
      }
      return { id: criterion.id, text: criterion.text, position: criterion.position };
    }).sort((a, b) => a.position - b.position),
    documents: documents.map((entry: unknown) => {
      const document = entry as Record<string, unknown> | null;
      if (typeof document !== "object" || document === null || typeof document.id !== "string" ||
          typeof document.title !== "string" || typeof document.fileName !== "string" ||
          typeof document.contentType !== "string" || typeof document.linkedBy !== "string" || !isDate(document.linkedAt) ||
          (document.archivedAt !== null && !isDate(document.archivedAt))) {
        throw new Error("The API returned an unexpected linked document.");
      }
      return {
        id: document.id, title: document.title, fileName: document.fileName, contentType: document.contentType,
        archivedAt: document.archivedAt as string | null, linkedBy: document.linkedBy, linkedAt: document.linkedAt as string,
      };
    }),
  };
}

/**
 * Reads and trims a requirement from a submitted form. Criteria come from every field named
 * "criteria", and linked documents from every checked box named "documents".
 */
export function readRequirementInput(formData: FormData): RequirementInput {
  const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "").trim();
  return {
    title: text(formData.get("title")),
    description: text(formData.get("description")),
    criteria: formData.getAll("criteria").map(text),
    documentIds: formData.getAll("documents").map(text).filter(Boolean),
    ...(formData.has("milestone") ? { milestone: text(formData.get("milestone")) } : {}),
  };
}

/** Returns messages for input the API would reject, or null when the input is acceptable. */
export function requirementErrors(input: RequirementInput): RequirementErrors | null {
  const errors: RequirementErrors = { items: {} };
  if (!input.title) errors.title = "Enter a title.";
  else if (input.title.length > REQUIREMENT_TITLE_MAX) errors.title = `Use ${REQUIREMENT_TITLE_MAX} characters or fewer.`;
  if (input.description.length > REQUIREMENT_DESCRIPTION_MAX) {
    errors.description = `Use ${REQUIREMENT_DESCRIPTION_MAX.toLocaleString("en")} characters or fewer.`;
  }
  if (input.criteria.length === 0) errors.criteria = "Add at least one acceptance criterion.";
  else if (input.criteria.length > CRITERIA_MAX) errors.criteria = `Use ${CRITERIA_MAX} acceptance criteria or fewer.`;
  if (input.documentIds.length > REQUIREMENT_DOCUMENTS_MAX) errors.documents = `Link ${REQUIREMENT_DOCUMENTS_MAX} documents or fewer.`;
  const milestone = milestoneError(input.milestone ?? "");
  if (milestone) errors.milestone = milestone;
  input.criteria.forEach((criterion, index) => {
    if (!criterion) errors.items[index] = "Enter the criterion or remove it.";
    else if (criterion.length > CRITERION_MAX) errors.items[index] = `Use ${CRITERION_MAX.toLocaleString("en")} characters or fewer.`;
  });
  return errors.title || errors.description || errors.criteria || errors.documents || errors.milestone || Object.keys(errors.items).length
    ? errors : null;
}

/**
 * Reads the label a milestone form sends: empty for Clear, otherwise the trimmed text of its
 * "milestone" field. Returns null when that field is missing or is not text, such as a file.
 */
export function readMilestoneInput(formData: FormData): string | null {
  if (formData.get("intent") === "clear") return "";
  const milestone = formData.get("milestone");
  return typeof milestone === "string" ? milestone.trim() : null;
}

/** Returns the message for a trimmed milestone label, or null when it is acceptable. Empty means no milestone. */
export function milestoneError(milestone: string): string | null {
  return milestone.length > MILESTONE_MAX ? `Use ${MILESTONE_MAX} characters or fewer.` : null;
}

/** Reports whether the criteria on a form differ from the saved ones, as the API compares them: trimmed, in order. */
export function criteriaChanged(saved: string[], entered: string[]): boolean {
  const trimmed = entered.map(text => text.trim());
  return trimmed.length !== saved.length || trimmed.some((text, index) => text !== saved[index]);
}

/** Maps a 400 problem-details body to requirement messages. Fields it does not recognize become a form message. */
export function requirementProblemErrors(problem: unknown, fallback: string): RequirementErrors {
  const errors: RequirementErrors = { items: {} };
  const fields = (problem as { errors?: unknown } | null)?.errors;
  let recognized = false;
  if (typeof fields === "object" && fields !== null) {
    for (const [field, messages] of Object.entries(fields as Record<string, unknown>)) {
      const message = Array.isArray(messages) && typeof messages[0] === "string" ? messages[0] : null;
      if (!message) continue;
      const item = /^acceptanceCriteria\[(\d+)\]$/.exec(field);
      if (field === "title") errors.title = message;
      else if (field === "description") errors.description = message;
      else if (field === "acceptanceCriteria") errors.criteria = message;
      else if (field === "documentIds") errors.documents = message;
      else if (field === "milestone") errors.milestone = message;
      else if (item) errors.items[Number(item[1])] = message;
      else continue;
      recognized = true;
    }
  }
  if (!recognized) errors.form = fallback;
  return errors;
}
