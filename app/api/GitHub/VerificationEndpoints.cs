using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;
using SpecThread.Api.Requirements;

namespace SpecThread.Api.GitHub;

// The project's predefined Playwright verification (ADR-070, US-15). An Owner or Admin names one
// GitHub Actions workflow file of the connected repository and its branch. Owners, Admins, and
// Members run it for a requirement: SpecThread starts that workflow and nothing else, passing only
// the run's ID, then reads the run's result, times, and log link from GitHub and keeps them on the
// requirement as evidence. Every member reads the settings and the runs.
internal static partial class VerificationEndpoints
{
    public const int MaxRuns = 50;

    [GeneratedRegex(@"^[A-Za-z0-9._-]{1,100}\.ya?ml$")]
    private static partial Regex WorkflowName();

    public static void MapVerificationEndpoints(this IEndpointRouteBuilder app)
    {
        var settings = app.MapGroup("/projects/{projectId:guid}/verification").WithTags("Verification").WithMetadata(ProjectEndpoints.Unauthorized);
        settings.MapGet("/", GetSettings).WithName("GetVerificationSettings");
        settings.MapPut("/", SetSettings).WithName("SetVerificationSettings").ProducesProblem(StatusCodes.Status409Conflict);
        settings.MapDelete("/", RemoveSettings).WithName("RemoveVerificationSettings").ProducesProblem(StatusCodes.Status409Conflict);
        var runs = app.MapGroup("/requirements/{requirementId:guid}/verification-runs").WithTags("Verification").WithMetadata(ProjectEndpoints.Unauthorized);
        runs.MapGet("/", ListRuns).WithName("ListVerificationRuns");
        runs.MapPost("/", StartRun).WithName("StartVerificationRun").ProducesProblem(StatusCodes.Status409Conflict);
        runs.MapPost("/refresh", RefreshRuns).WithName("RefreshVerificationRuns").ProducesProblem(StatusCodes.Status409Conflict);
    }

    private static async Task<Results<Ok<VerificationSettingsResponse>, NotFound>> GetSettings(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (!await db.ProjectsFor(user.CallerId()).AnyAsync(p => p.Id == projectId, cancel)) return TypedResults.NotFound();
        var settings = await db.ProjectVerifications.AsNoTracking().SingleOrDefaultAsync(v => v.ProjectId == projectId, cancel);
        var repository = await db.ProjectRepositories.AsNoTracking().SingleOrDefaultAsync(r => r.ProjectId == projectId, cancel);
        return TypedResults.Ok(ToSettings(settings, repository));
    }

    // Saves the workflow and branch once GitHub confirms the connected repository has that workflow
    // and it is active. Only the team's Owner or an Admin, as for the repository itself (ADR-041).
    private static async Task<Results<Ok<VerificationSettingsResponse>, ValidationProblem, NotFound, ProblemHttpResult>> SetSettings(
        Guid projectId, VerificationSettingsRequest request, ClaimsPrincipal user, SpecThreadDbContext db, IGitHubClient github, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var workflow = errors.Required("workflow", request.Workflow, 105);
        if (workflow is not null && !WorkflowName().IsMatch(workflow))
        {
            errors.Add("workflow", "Enter the workflow's file name in .github/workflows, such as specthread-verification.yml.");
        }
        var branch = errors.Required("branch", request.Branch, 255);
        if (branch is not null && branch.Any(char.IsWhiteSpace)) errors.Add("branch", "A branch name has no spaces.");
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var userId = user.CallerId();
        var project = await db.ProjectsFor(userId).AsNoTracking().SingleOrDefaultAsync(p => p.Id == projectId, cancel);
        if (project is null) return TypedResults.NotFound();
        if (!TeamRoles.CanManage(await db.CallerRoleAsync(project.TeamId, userId, cancel))) return ProjectEndpoints.ManagersOnly();
        if (project.ArchivedAt is not null) return ProjectEndpoints.Archived();
        var repository = await db.ProjectRepositories.AsNoTracking().SingleOrDefaultAsync(r => r.ProjectId == projectId, cancel);
        if (repository is null) return NoRepository();

        var found = await github.GetWorkflowAsync(repository.InstallationId, repository.RepositoryId, workflow!, cancel);
        if (found.Failure == GitHubFailure.NotFound)
        {
            errors.Add("workflow", $"GitHub has no workflow {workflow} in {repository.Owner}/{repository.Name}, or the SpecThread app can't read its Actions.");
            return TypedResults.ValidationProblem(errors.ToDictionary());
        }
        if (found.Failure != GitHubFailure.None) return Failed(found.Failure, repository);
        if (!found.Value!.Active) return TypedResults.Problem($"The workflow {workflow} is disabled on GitHub. Enable it there first.", statusCode: StatusCodes.Status409Conflict);

        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var locked = await ProjectEndpoints.LockProjectForCaller(db, projectId, userId, cancel);
        if (locked is null) return TypedResults.NotFound();
        if (!TeamRoles.CanManage(await db.CallerRoleAsync(locked.TeamId, userId, cancel))) return ProjectEndpoints.ManagersOnly();
        if (locked.ArchivedAt is not null) return ProjectEndpoints.Archived();
        if (!await db.ProjectRepositories.AnyAsync(r => r.ProjectId == projectId && r.RepositoryId == repository.RepositoryId, cancel)) return Changed();
        var settings = await db.ProjectVerifications.SingleOrDefaultAsync(v => v.ProjectId == projectId, cancel);
        if (settings is null)
        {
            settings = new ProjectVerification { ProjectId = projectId, Workflow = workflow!, Branch = branch!, ConfiguredBy = userId };
            db.ProjectVerifications.Add(settings);
        }
        (settings.RepositoryId, settings.Workflow, settings.Branch, settings.ConfiguredBy, settings.ConfiguredAt) =
            (repository.RepositoryId, workflow!, branch!, userId, Clock.UtcNow());
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Ok(ToSettings(settings, repository));
    }

    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> RemoveSettings(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var userId = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var project = await ProjectEndpoints.LockProjectForCaller(db, projectId, userId, cancel);
        if (project is null) return TypedResults.NotFound();
        if (!TeamRoles.CanManage(await db.CallerRoleAsync(project.TeamId, userId, cancel))) return ProjectEndpoints.ManagersOnly();
        if (project.ArchivedAt is not null) return ProjectEndpoints.Archived();
        await db.ProjectVerifications.Where(v => v.ProjectId == projectId).ExecuteDeleteAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.NoContent();
    }

    // Newest first, at most MaxRuns.
    private static async Task<Results<Ok<List<VerificationRunResponse>>, NotFound>> ListRuns(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (await FindAsync(db, user.CallerId(), requirementId, cancel) is null) return TypedResults.NotFound();
        return TypedResults.Ok(await ReadRunsAsync(db, requirementId, cancel));
    }

    // Records the run first, so two people can't start runs at once, then asks GitHub to start
    // the predefined workflow with the run's ID. If GitHub refuses, the run is kept as "not_started".
    private static async Task<Results<Created<VerificationRunResponse>, NotFound, ProblemHttpResult>> StartRun(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, IGitHubClient github, CancellationToken cancel)
    {
        var userId = user.CallerId();
        VerificationRun run;
        ProjectRepository repository;
        await using (var transaction = await db.Database.BeginTransactionAsync(cancel))
        {
            var found = await RequirementEndpoints.LockForMember(db, userId, requirementId, cancel);
            if (found is null) return TypedResults.NotFound();
            if (!found.CanEdit) return ProjectEndpoints.EditorsOnly();
            if (found.Archived) return ProjectEndpoints.Archived();
            var projectId = found.Requirement.ProjectId;
            var connected = await db.ProjectRepositories.AsNoTracking().SingleOrDefaultAsync(r => r.ProjectId == projectId, cancel);
            if (connected is null) return NoRepository();
            repository = connected;
            var settings = await db.ProjectVerifications.AsNoTracking().SingleOrDefaultAsync(v => v.ProjectId == projectId, cancel);
            if (settings is null) return NotSetUp();
            if (settings.RepositoryId != repository.RepositoryId) return OtherRepository();
            if (await db.VerificationRuns.AnyAsync(r => r.RequirementId == requirementId && r.Status != "completed", cancel)) return AlreadyRunning();
            run = new VerificationRun
            {
                Id = Guid.NewGuid(),
                RequirementId = requirementId,
                RepositoryId = repository.RepositoryId,
                Workflow = settings.Workflow,
                Branch = settings.Branch,
                Status = "requested",
                RequestedBy = userId,
                RequestedAt = Clock.UtcNow(),
            };
            db.VerificationRuns.Add(run);
            await db.SaveChangesAsync(cancel);
            await transaction.CommitAsync(cancel);
        }

        var dispatched = await github.DispatchWorkflowAsync(repository.InstallationId, repository.RepositoryId, run.Workflow, run.Branch, RunName(run), cancel);
        if (dispatched.Failure == GitHubFailure.None) return TypedResults.Created($"/requirements/{requirementId}/verification-runs/{run.Id}", ToResponse(run));
        // Not started: kept so the attempt is on record, and so another run can start.
        (run.Status, run.Result, run.CompletedAt, run.CheckedAt) = ("completed", "not_started", Clock.UtcNow(), Clock.UtcNow());
        await db.SaveChangesAsync(CancellationToken.None);
        return dispatched.Failure == GitHubFailure.NotFound
            ? TypedResults.Problem(
                $"GitHub didn't start {run.Workflow} on {run.Branch}. Check that the branch exists, that the workflow accepts the specthread_run input, and that the SpecThread app may run Actions.",
                statusCode: StatusCodes.Status409Conflict)
            : Failed(dispatched.Failure, repository);
    }

    // Reads every unfinished run of the requirement from GitHub and saves what changed.
    private static async Task<Results<Ok<List<VerificationRunResponse>>, NotFound, ProblemHttpResult>> RefreshRuns(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, IGitHubClient github, CancellationToken cancel)
    {
        var userId = user.CallerId();
        var scope = await FindAsync(db, userId, requirementId, cancel);
        if (scope is null) return TypedResults.NotFound();
        if (!TeamRoles.CanEdit(scope.Role)) return ProjectEndpoints.EditorsOnly();
        var repository = await db.ProjectRepositories.AsNoTracking().SingleOrDefaultAsync(r => r.ProjectId == scope.ProjectId, cancel);
        if (repository is null) return NoRepository();
        var open = await db.VerificationRuns.Where(r => r.RequirementId == requirementId && r.Status != "completed").ToListAsync(cancel);
        foreach (var run in open)
        {
            if (run.RepositoryId != repository.RepositoryId) continue;
            // A few minutes' allowance for the clocks of GitHub and this server differing.
            var found = await github.FindWorkflowRunAsync(
                repository.InstallationId, repository.RepositoryId, run.Workflow, RunName(run), run.RequestedAt.AddMinutes(-5), cancel);
            if (found.Failure != GitHubFailure.None) return Failed(found.Failure, repository);
            run.CheckedAt = Clock.UtcNow();
            if (found.Value is not { } seen) continue;
            (run.GitHubRunId, run.Url, run.StartedAt) = (seen.Id, seen.Url, seen.StartedAt);
            if (seen.Result == "running")
            {
                run.Status = "running";
            }
            else
            {
                (run.Status, run.Result, run.CompletedAt) = ("completed", seen.Result, seen.CompletedAt ?? Clock.UtcNow());
            }
        }
        await db.SaveChangesAsync(cancel);
        return TypedResults.Ok(await ReadRunsAsync(db, requirementId, cancel));
    }

    // What the workflow puts in its run name, so SpecThread finds the run it started.
    private static string RunName(VerificationRun run) => $"specthread-{run.Id:N}";

    private static async Task<List<VerificationRunResponse>> ReadRunsAsync(SpecThreadDbContext db, Guid requirementId, CancellationToken cancel) =>
        (await db.VerificationRuns.AsNoTracking().Where(r => r.RequirementId == requirementId)
            .OrderByDescending(r => r.RequestedAt).ThenByDescending(r => r.Id).Take(MaxRuns).ToListAsync(cancel)).ConvertAll(ToResponse);

    private static Task<Scope?> FindAsync(SpecThreadDbContext db, string userId, Guid requirementId, CancellationToken cancel) =>
        db.Requirements.AsNoTracking().Where(r => r.Id == requirementId)
            .Join(db.ProjectsFor(userId), r => r.ProjectId, p => p.Id, (r, p) => new Scope(p.Id,
                db.Teams.Any(t => t.Id == p.TeamId && t.OwnerUserId == userId) ? TeamRoles.Owner
                    : db.TeamMembers.Where(m => m.TeamId == p.TeamId && m.UserId == userId).Select(m => m.Role).First()))
            .SingleOrDefaultAsync(cancel);

    private sealed record Scope(Guid ProjectId, string Role);

    private static VerificationSettingsResponse ToSettings(ProjectVerification? settings, ProjectRepository? repository) =>
        settings is null
            ? new VerificationSettingsResponse(false, null, null, null, null, false)
            : new VerificationSettingsResponse(true, settings.Workflow, settings.Branch, settings.ConfiguredBy, settings.ConfiguredAt,
                repository is not null && repository.RepositoryId == settings.RepositoryId);

    private static VerificationRunResponse ToResponse(VerificationRun r) => new(
        r.Id, r.RequirementId, r.Workflow, r.Branch, r.Status, r.Result, r.Url, r.RequestedBy, r.RequestedAt, r.StartedAt, r.CompletedAt, r.CheckedAt);

    private static ProblemHttpResult NoRepository() =>
        TypedResults.Problem("Connect a GitHub repository to this project first.", statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult NotSetUp() => TypedResults.Problem(
        "This project has no verification set up. An Owner or Admin sets it up in project settings.", statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult OtherRepository() => TypedResults.Problem(
        "The verification was set up for a repository that is no longer connected. An Owner or Admin must set it up again.",
        statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult AlreadyRunning() => TypedResults.Problem(
        "A verification run for this requirement hasn't finished yet. Refresh it to read its result first.", statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult Changed() => TypedResults.Problem(
        "The project's repository changed while GitHub was being read. Try again.", statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult Failed(GitHubFailure failure, ProjectRepository repository) => failure == GitHubFailure.NotInstalled
        ? TypedResults.Problem($"The SpecThread app is no longer installed on {repository.Owner}/{repository.Name}. Connect the repository again.",
            statusCode: StatusCodes.Status409Conflict)
        : RepositoryEndpoints.Failed(failure);
}

internal sealed record VerificationSettingsRequest(string? Workflow, string? Branch);

// Configured is false when no verification is set up; the other fields are then null. Current is
// false when it was set up for a repository that is no longer the connected one.
internal sealed record VerificationSettingsResponse(
    bool Configured, string? Workflow, string? Branch, string? ConfiguredBy, DateTime? ConfiguredAt, bool Current);

internal sealed record VerificationRunResponse(
    Guid Id, Guid RequirementId, string Workflow, string Branch, string Status, string? Result, string? Url, string RequestedBy,
    DateTime RequestedAt, DateTime? StartedAt, DateTime? CompletedAt, DateTime? CheckedAt);
