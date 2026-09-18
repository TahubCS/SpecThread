Team Development Workflow

Goal

Every team member should be able to branch from the same known baseline, complete one bounded task, and hand it back without depending on a particular AI tool or personal editor setup.

Shared baseline

Before parallel feature work begins, merge one foundation pull request that establishes:

agreed repository layout;

build and test commands;

environment-variable examples without secrets;

formatting, linting, and strict compiler settings;

basic CI;

a minimal health check for each application;

the project documentation in this folder.

Do not let several members independently create competing application structures. That produces merge conflicts before useful feature work begins.

Task definition

Each task should include:

problem or user story;

acceptance criteria;

owned area and expected files;

dependencies on other tasks;

explicit non-goals;

verification commands;

UI reference or API contract when applicable.

A task is too large if it cannot be reviewed independently or if multiple members must edit the same core files continuously.

Branch workflow

Before starting each new task, ask the user for permission to create a new task branch. Wait for their answer before beginning implementation, unless they have already explicitly chosen a branch for that task.

If the user approves, update the agreed integration branch and create and switch to a short-lived task branch before doing the work. If the user says to stay on the current branch, work there without creating or switching branches. Carry that choice through follow-up work on the same task without asking again. The Playwright foundation work is on main at the user's request.

Implement only the task's acceptance criteria.

Commit focused, reviewable changes.

Run relevant checks locally.

Use Playwright Test for all automated behavior tests, following TESTING.md. Run npm test from the repository root; Playwright builds and starts both applications automatically. Run npm run lint, npm run typecheck, and dotnet format app/api --verify-no-changes separately. Discover tests without starting the apps with npm test -- --list. Initialize EF Core before database execution and follow DATABASE.md for future migrations. Add tests for changed behavior using the existing runner rather than introducing another framework.

Update documentation and the handoff if shared state changed.

Open a pull request and request review.

Resolve conflicts without discarding another member's work.

Suggested branch patterns:

feature/12-requirement-create

fix/27-webhook-signature

docs/8-api-contract

Use the team's issue number when one exists.

Parallel work boundaries

Early tasks should be divided along stable boundaries, for example:

web shell and shared visual system;

requirement API and persistence;

GitHub integration spike;

evidence timeline UI using an agreed mock contract;

Playwright and CI foundation;

database migrations and seed strategy.

Frontend and backend work may proceed in parallel only after agreeing on an API example or OpenAPI contract. Mock data must be clearly marked and removed or replaced before the feature is considered integrated.

Pull-request expectations

Every pull request should state:

what problem it solves;

what changed;

what intentionally did not change;

how it was tested;

screenshots or recordings for visible UI changes;

database migrations or environment changes;

risks, limitations, and follow-up work.

Reviewers should check behavior and scope, not only formatting. Large unrelated refactors should be split from feature work.

AI-assisted work

Team members may use different AI tools, but repository artifacts—not chat history—are the shared memory.

Give an agent one bounded task and its acceptance criteria.

Require it to read AGENTS.md and relevant docs first.

Require it to inspect existing code before proposing structural changes.

Review generated code and diffs; the human author owns the contribution.

Never let an agent fabricate successful checks, GitHub data, environment variables, or decisions.

Record durable decisions in the repository.

Integration discipline

Integrate small vertical slices early instead of building isolated layers for weeks.

Assign an owner before changing shared contracts or configuration.

Treat migrations, API contracts, root configuration, and CI as coordination hotspots.

Announce changes to hotspots before merging them.

Prefer backward-compatible contract changes while another branch depends on the current shape.

Definition of done

A task is done when:

its acceptance criteria pass;

relevant tests, linting, type checks, and builds pass;

failure and empty states are handled where applicable;

no secrets or debug artifacts are committed;

documentation and contracts match the implementation;

the pull request is reviewable;

the handoff names remaining limitations and the next step.
