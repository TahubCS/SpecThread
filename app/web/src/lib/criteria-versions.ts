import { isVersion } from "./reviews";

/** A requirement's acceptance criteria as they were saved at one point (ADR-051). `criteria` is in order. */
export type CriteriaVersion = { number: number; criteria: string[]; createdBy: string; createdAt: string };

const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

/** Validates one criteria version from an API response. Throws when the shape is not the documented one. */
export function parseCriteriaVersion(value: unknown): CriteriaVersion {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || !isVersion(item.number) || !Array.isArray(item.criteria) ||
      !item.criteria.every(text => typeof text === "string") || typeof item.createdBy !== "string" || !isDate(item.createdAt)) {
    throw new Error("The API returned an unexpected criteria version.");
  }
  return { number: item.number, criteria: item.criteria as string[], createdBy: item.createdBy, createdAt: item.createdAt };
}

/** Validates a list of criteria versions from an API response, newest first. */
export function parseCriteriaVersions(value: unknown): CriteriaVersion[] {
  if (!Array.isArray(value)) throw new Error("The API returned an unexpected criteria version list.");
  return value.map(parseCriteriaVersion);
}

/** Describes a criteria version, such as "Criteria version 3" or "Criteria version not recorded". */
export function criteriaVersionText(number: number | null): string {
  return number === null ? "Criteria version not recorded" : `Criteria version ${number}`;
}
