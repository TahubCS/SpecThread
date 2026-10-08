import type { RequirementSummary } from "./projects";

/** A requirement with its description and ordered acceptance criteria (docs/API.md). */
export type Requirement = Omit<RequirementSummary, "review" | "evidenceCount"> & {
  description: string;
  createdBy: string;
  acceptanceCriteria: { id: string; text: string; position: number }[];
};

export const REQUIREMENT_TITLE_MAX = 200;
export const REQUIREMENT_DESCRIPTION_MAX = 10_000;
export const CRITERIA_MAX = 50;
export const CRITERION_MAX = 2_000;

/** Returns the list with the item at `from` moved to `to`, or the same list when either position does not exist. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const valid = (index: number) => Number.isInteger(index) && index >= 0 && index < list.length;
  if (!valid(from) || !valid(to) || from === to) return list;
  const result = [...list];
  result.splice(to, 0, ...result.splice(from, 1));
  return result;
}

/** What a user enters for a requirement. `criteria` is in display order. */
export type RequirementInput = { title: string; description: string; criteria: string[] };

/** Messages for a rejected requirement. `items` maps a criterion's position to its message. */
export type RequirementErrors = {
  title?: string;
  description?: string;
  criteria?: string;
  items: Record<number, string>;
  form?: string;
};

/** Validates one requirement from an API response. Throws when the shape is not the documented one. */
export function parseRequirement(value: unknown): Requirement {
  const item = value as Record<string, unknown> | null;
  const isDate = (date: unknown) => typeof date === "string" && !Number.isNaN(Date.parse(date));
  const criteria = item?.acceptanceCriteria;
  if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.projectId !== "string" ||
      typeof item.title !== "string" || typeof item.description !== "string" || typeof item.createdBy !== "string" ||
      typeof item.version !== "number" || !isDate(item.createdAt) || !isDate(item.updatedAt) ||
      (item.archivedAt !== null && typeof item.archivedAt !== "string") || !Array.isArray(criteria)) {
    throw new Error("The API returned an unexpected requirement.");
  }
  return {
    id: item.id, projectId: item.projectId, title: item.title, description: item.description, createdBy: item.createdBy,
    version: item.version, createdAt: item.createdAt as string, updatedAt: item.updatedAt as string, archivedAt: item.archivedAt,
    acceptanceCriteria: criteria.map((entry: unknown) => {
      const criterion = entry as Record<string, unknown> | null;
      if (typeof criterion !== "object" || criterion === null || typeof criterion.id !== "string" ||
          typeof criterion.text !== "string" || typeof criterion.position !== "number") {
        throw new Error("The API returned an unexpected acceptance criterion.");
      }
      return { id: criterion.id, text: criterion.text, position: criterion.position };
    }).sort((a, b) => a.position - b.position),
  };
}

/** Reads and trims a requirement from a submitted form. Criteria come from every field named "criteria". */
export function readRequirementInput(formData: FormData): RequirementInput {
  const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "").trim();
  return {
    title: text(formData.get("title")),
    description: text(formData.get("description")),
    criteria: formData.getAll("criteria").map(text),
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
  if (input.criteria.length > CRITERIA_MAX) errors.criteria = `Use ${CRITERIA_MAX} acceptance criteria or fewer.`;
  input.criteria.forEach((criterion, index) => {
    if (!criterion) errors.items[index] = "Enter the criterion or remove it.";
    else if (criterion.length > CRITERION_MAX) errors.items[index] = `Use ${CRITERION_MAX.toLocaleString("en")} characters or fewer.`;
  });
  return errors.title || errors.description || errors.criteria || Object.keys(errors.items).length ? errors : null;
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
      else if (item) errors.items[Number(item[1])] = message;
      else continue;
      recognized = true;
    }
  }
  if (!recognized) errors.form = fallback;
  return errors;
}
