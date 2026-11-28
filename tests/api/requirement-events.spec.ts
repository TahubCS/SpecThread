import { expect, test } from "@playwright/test";
import {
  auditEntryText, parseAuditTrail, parseRequirementEvents, requirementEventText, type AuditEntry,
} from "../../app/web/src/lib/requirement-events";

// Parsing and wording of the requirement change record and the project audit trail (ADR-065, US-21).

const event = { id: "e1", requirementId: "r1", action: "edited", version: 3, changes: ["title", "criteria"], milestone: null,
  actor: "u1", occurredAt: "2026-11-28T10:00:00Z" };
const entry: AuditEntry = { id: "a1", requirementId: "r1", requirementTitle: "Guest checkout", area: "requirement", action: "created",
  actor: "u1", occurredAt: "2026-11-28T10:00:00Z", version: 1, changes: null, milestone: null, label: null, title: null,
  otherRequirementTitle: null };

test("requirement changes and audit entries are accepted only in the documented shape", () => {
  expect(parseRequirementEvents([{ ...event, extra: true }])).toEqual([event]);
  expect(parseAuditTrail([entry])).toEqual([entry]);
  for (const value of [null, {}, { ...event, action: "renamed" }, { ...event, version: 0 }, { ...event, version: 1.5 },
    { ...event, changes: ["owner"] }, { ...event, changes: "title" }, { ...event, milestone: 5 }, { ...event, actor: null },
    { ...event, occurredAt: "soon" }, { ...event, id: 1 }]) {
    expect(() => parseRequirementEvents([value]), JSON.stringify(value)).toThrow("unexpected change record");
  }
  expect(() => parseRequirementEvents({})).toThrow("unexpected change record");
  for (const value of [{ ...entry, area: "billing" }, { ...entry, requirementTitle: null }, { ...entry, label: 4 },
    { ...entry, otherRequirementTitle: 1 }, { ...entry, occurredAt: "later" }, { ...entry, changes: ["x"] }]) {
    expect(() => parseAuditTrail([value]), JSON.stringify(value)).toThrow("unexpected audit trail");
  }
});

test("each change is described in plain words", () => {
  const text = (changes: Record<string, unknown>) => requirementEventText({ ...event, ...changes } as never);
  expect(text({ action: "created", version: 1, changes: null })).toBe("Created the requirement");
  expect(text({ changes: ["title"] })).toBe("Edited the title (version 3)");
  expect(text({ changes: ["title", "criteria"] })).toBe("Edited the title and acceptance criteria (version 3)");
  expect(text({ changes: ["title", "description", "criteria", "documents"] }))
    .toBe("Edited the title, description, acceptance criteria and linked documents (version 3)");
  expect(text({ changes: [] })).toBe("Saved without changes (version 3)");
  expect(text({ changes: null })).toBe("Saved version 3; what changed was not recorded");
  expect(text({ action: "archived", changes: null })).toBe("Archived the requirement");
  expect(text({ action: "restored", changes: null })).toBe("Restored the requirement");
  expect(text({ action: "milestone_set", changes: null, milestone: "Sprint 2" })).toBe("Set the milestone to “Sprint 2”");
  expect(text({ action: "milestone_cleared", changes: null })).toBe("Cleared the milestone");

  const audit = (changes: Partial<AuditEntry>) => auditEntryText({ ...entry, ...changes });
  expect(audit({})).toBe("Created the requirement");
  expect(audit({ area: "evidence", action: "added", label: "#4", title: "Guests cannot pay" })).toBe("Linked #4 “Guests cannot pay”");
  expect(audit({ area: "evidence", action: "removed", label: "v1.2", title: "Spring" })).toBe("Removed v1.2 “Spring”");
  expect(audit({ area: "evidence", action: "moved_out", label: "#9", title: "Fix", otherRequirementTitle: "Billing" })).toBe("Moved #9 “Fix” to “Billing”");
  expect(audit({ area: "evidence", action: "moved_in", label: "#9", title: "Fix", otherRequirementTitle: null }))
    .toBe("Moved #9 “Fix” here from “another requirement”");
  expect(audit({ area: "decision", action: "more_evidence", version: 2 })).toBe("Recorded “More evidence requested” on version 2");
  expect(audit({ area: "decision", action: "accepted", version: null })).toBe("Recorded “Accepted”");
  expect(audit({ area: "follow_up", action: "added", otherRequirementTitle: "First" })).toBe("Marked as a follow-up of “First”");
  expect(audit({ area: "follow_up", action: "removed", otherRequirementTitle: "First" })).toBe("Removed the follow-up of “First”");
  expect(audit({ area: "comment", action: "created" })).toBe("Posted a comment");
  expect(audit({ area: "comment", action: "edited" })).toBe("Edited a comment");
  expect(audit({ area: "comment", action: "deleted" })).toBe("Deleted a comment");
});
