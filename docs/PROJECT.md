SpecThread Project Definition

One-sentence description

SpecThread connects software requirements to inspectable implementation evidence such as GitHub issues, pull requests, commits, automated tests, and releases.

Problem

Project-management tools show that a task moved to “Done,” but that status alone does not show what code implemented the requirement, which checks ran, or whether the result reached a release. Evidence is scattered across tickets, GitHub, CI systems, and deployment history.

SpecThread gives each requirement a traceable evidence thread. A reviewer can follow the requirement to the work that claims to implement it and then decide whether the evidence is sufficient.

Intended users

Small software teams that manage requirements and development work.

Project managers or clients who need a readable view of implementation progress.

Developers and reviewers who need direct links to technical evidence.

Project ownership

A user may belong to multiple teams, and every project belongs to one team.
The combined projects view groups accessible projects by team; a team's
projects view shows only that team's projects. Every team member can access
its projects and work on requirements. Only the team's Owner and Admins create
projects or manage their names, settings, and archive/restore actions (ADR-040).

After the first verified sign-in, required onboarding asks for the initial team's
name and optional description. The creator becomes its Owner. Completion is saved
on the server; leaving the browser or visiting another app page resumes incomplete
onboarding. Verified users arriving through an invitation can instead accept it,
join the invited team, and complete onboarding without naming a separate team.
Every new membership requires acceptance; Owners invite Admins/Members, and Admins
invite Members. Invitations use email plus copyable links and expire after seven days.

Core workflow

A user creates a requirement with clear acceptance criteria.

The team associates the requirement with a GitHub repository and issue.

Pull requests and commits are linked manually or suggested from explicit references.

CI results, selected automated tests, and release information are collected.

SpecThread presents the evidence in one chronological thread.

An authorized reviewer accepts, rejects, or requests more evidence.

Story: create a requirement

As a tech lead (Danielle), I want to create a requirement with a title, description,
and testable acceptance criteria so that my team and the client agree on what "done"
means before work starts. Source: "Design the Box" F1. Acceptance criteria:

A requirement can't be saved without a title and at least one acceptance criterion.

Each acceptance criterion is stored and displayed as its own item.

The requirement records who created it and when.

Only members of the project's team can create requirements.

The requirement can also link the project documents it comes from or relies on (ADR-049).

Story criteria: editing and archiving requirements (ADR-050):

Edits save the editor's name and a timestamp.

Archived requirements are hidden from the default list but can still be opened read-only.

Archived requirements can't be edited or reviewed until restored.

MVP scope

The first usable version should support:

multiple team memberships and projects owned by teams;

creating, viewing, editing, and archiving requirements;

writing testable acceptance criteria;

uploading project reference documents (PDF, DOC, DOCX) that every member of the project's team can download (ADR-047), and linking them from requirements (ADR-049);

connecting one GitHub repository;

linking GitHub issues and pull requests to a requirement;

displaying relevant commits, pull-request status, and CI/check results;

recording a release or deployment reference;

presenting an evidence timeline for each requirement;

recording a human review decision and note;

one small, predefined Playwright verification path as a proof of concept;

audit timestamps for important state changes.

Explicitly out of scope for the MVP

Automatically understanding or proving every arbitrary feature.

Replacing Jira, Linear, GitHub Issues, or a full test-management suite.

Supporting multiple source-control providers.

Generating production code from requirements.

Autonomous merging, deployment, or requirement approval.

A general-purpose browser-testing platform.

Complex enterprise permissions, billing, or multi-tenant administration.

Microservices, event streaming, or infrastructure added only for hypothetical scale.

Evidence and verification language

Use precise product language:

“Linked” means an artifact has an explicit or user-confirmed relationship to a requirement.

“Check passed” means a recorded automated check reported success.

“Evidence complete” means the configured evidence policy is satisfied. Until a configurable policy exists, a fixed rule applies: linked pull requests or commits whose recorded checks all passed or were skipped (ADR-053).

“Accepted” means an authorized human approved the requirement.

Do not label a requirement “proven correct.” Passing checks are evidence, not proof of all possible behavior.

Success criteria

The MVP succeeds if a reviewer can open a requirement and answer these questions without searching multiple systems:

What was requested?

What acceptance criteria were defined?

Which issue, pull request, and commits implemented it?

Which automated checks ran, and what were their results?

Was the change associated with a release or deployment?

Who accepted or rejected the available evidence, and when?

Later possibilities

After the deterministic workflow works, the team may explore AI-assisted summaries, candidate link suggestions, risk flags, and acceptance-criterion drafting. Every suggestion must be labeled, reviewable, and reversible.
