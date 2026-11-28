import { expect, test } from "@playwright/test";
import { GLOSSARY, GLOSSARY_ORDER } from "../../app/web/src/lib/glossary";
import { EVIDENCE_PART_TEXT } from "../../app/web/src/lib/projects";

// Plain-language explanations (US-17), without a browser.

test("every term a reviewer meets has a short plain-language explanation, and none claims proof", () => {
  expect([...GLOSSARY_ORDER].sort()).toEqual(Object.keys(GLOSSARY).sort());
  for (const name of ["pull_request", "commit", "check", "release"] as const) expect(GLOSSARY_ORDER).toContain(name);
  // The product's own status labels, as docs/PROJECT.md defines them.
  expect(GLOSSARY_ORDER.map(name => GLOSSARY[name].term)).toEqual(expect.arrayContaining(["Linked", "Check passed", "Evidence complete", "Accepted"]));
  for (const name of GLOSSARY_ORDER) {
    const { term, text } = GLOSSARY[name];
    expect(text.length, term).toBeLessThanOrEqual(200);
    expect(text, term).toMatch(/\.$/);
    expect(text, term).not.toMatch(/\b(verified|proven|proves)\b/i);
  }
  expect(GLOSSARY.check_passed.text).toContain("not that every possible situation works");
  expect(GLOSSARY.evidence_complete.text).toContain("not the same as accepted");
  // The Evidence complete rule's wording on screen stays the same words as before.
  expect(Object.values(EVIDENCE_PART_TEXT)).toEqual([
    "A linked issue", "A merged pull request", "Checks passed on the final commit of each merged pull request",
    "A linked release that includes each merged pull request",
  ]);
});
