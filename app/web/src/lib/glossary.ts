/**
 * Plain-language explanations of the technical terms and status labels a reviewer meets on a
 * requirement (US-17), for someone without an engineering background. The status labels follow
 * docs/PROJECT.md's product language: "Linked", "Check passed", "Evidence complete", and
 * "Accepted". Nothing here says verified or proven (ADR-004).
 */
export const GLOSSARY = {
  issue: {
    term: "Issue",
    text: "A task or problem written down on GitHub, usually describing what needs to change.",
  },
  pull_request: {
    term: "Pull request",
    text: "A proposed set of code changes, submitted so others can review them before they are added to the main code.",
  },
  merged: {
    term: "Merged",
    text: "A pull request's changes were accepted and added to the main code.",
  },
  commit: {
    term: "Commit",
    text: "One saved change to the code, with a short note describing what changed.",
  },
  check: {
    term: "Check",
    text: "An automated test or tool that runs on a commit and reports a result, such as passed or failed.",
  },
  release: {
    term: "Release",
    text: "A named version of the software, such as v1.2, published on GitHub so it can be delivered to people.",
  },
  linked: {
    term: "Linked",
    text: "A team member connected this item to the requirement, or confirmed a suggestion to connect it.",
  },
  check_passed: {
    term: "Check passed",
    text: "An automated check reported success. It shows the code passed that check, not that every possible situation works.",
  },
  evidence_complete: {
    term: "Evidence complete",
    text: "The team's rule is met: an issue and a merged pull request are linked; each merged one is in a release and has a passed check, none failed, cancelled, or running. It is not the same as accepted.",
  },
  accepted: {
    term: "Accepted",
    text: "A person with the right role reviewed the evidence and approved the requirement.",
  },
} as const;

export type GlossaryTerm = keyof typeof GLOSSARY;

/** The order terms are listed in the glossary: the work on GitHub first, then the product's own labels. */
export const GLOSSARY_ORDER: GlossaryTerm[] = [
  "issue", "pull_request", "merged", "commit", "check", "release", "linked", "check_passed", "evidence_complete", "accepted",
];
