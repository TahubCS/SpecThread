using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.GitHub;

// Releases recorded as deployed to an environment (ADR-066). A tech lead records that a published
// release of the connected repository reached an environment on a date; SpecThread asks GitHub
// which of the project's linked commits and merged pull requests the release's history includes,
// so every requirement with such a change shows the deployment. Who recorded it and when is kept.
// Any member reads; Owners, Admins, and Members record and refresh (ADR-058).
internal static class ReleaseEndpoints
{
    public const int MaxEnvironmentLength = 50;
    public const int MaxTagLength = 255;
    // A project's linked changes are compared one GitHub call each; past this many, recording asks
    // the team to narrow the project instead of making hundreds of calls in one request.
    public const int MaxComparisons = 300;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static void MapReleaseEndpoints(this IEndpointRouteBuilder app)
    {
        var byProject = app.MapGroup("/projects/{projectId:guid}/releases").WithTags("Releases").WithMetadata(ProjectEndpoints.Unauthorized);
        byProject.MapGet("/", List).WithName("ListProjectReleases");
        byProject.MapPost("/", Record).WithName("RecordProjectRelease").ProducesProblem(StatusCodes.Status409Conflict);
        var releases = app.MapGroup("/releases").WithTags("Releases").WithMetadata(ProjectEndpoints.Unauthorized);
        releases.MapGet("/{releaseId:guid}", Get).WithName("GetProjectRelease");
        releases.MapPost("/{releaseId:guid}/refresh", Refresh).WithName("RefreshProjectRelease").ProducesProblem(StatusCodes.Status409Conflict);
    }

    // Newest deployment first.
    private static async Task<Results<Ok<List<ReleaseResponse>>, NotFound>> List(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (!await db.ProjectsFor(user.CallerId()).AnyAsync(p => p.Id == projectId, cancel)) return TypedResults.NotFound();
        var rows = await db.ProjectReleases.AsNoTracking().Where(r => r.ProjectId == projectId)
            .OrderByDescending(r => r.DeployedOn).ThenByDescending(r => r.RecordedAt).ToListAsync(cancel);
        return TypedResults.Ok(await ToResponsesAsync(db, rows, cancel));
    }

    private static async Task<Results<Ok<ReleaseResponse>, NotFound>> Get(
        Guid releaseId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var row = await db.ProjectReleases.AsNoTracking().Where(r => r.Id == releaseId)
            .Join(db.ProjectsFor(user.CallerId()), r => r.ProjectId, p => p.Id, (r, p) => r).SingleOrDefaultAsync(cancel);
        if (row is null) return TypedResults.NotFound();
        return TypedResults.Ok((await ToResponsesAsync(db, [row], cancel))[0]);
    }

    private static async Task<Results<Created<ReleaseResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Record(
        Guid projectId, RecordReleaseRequest request, ClaimsPrincipal user, SpecThreadDbContext db, IGitHubClient github, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var tag = errors.Required("tag", request.Tag, MaxTagLength);
        if (tag is not null && tag.Any(char.IsWhiteSpace)) errors.Add("tag", "A tag has no spaces. Enter it as it appears on GitHub.");
        var environment = errors.Required("environment", request.Environment, MaxEnvironmentLength);
        var deployedOn = ReadDate(errors, request.DeployedOn);
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var userId = user.CallerId();
        var project = await db.ProjectsFor(userId).AsNoTracking().SingleOrDefaultAsync(p => p.Id == projectId, cancel);
        if (project is null) return TypedResults.NotFound();
        if (!TeamRoles.CanEdit(await db.CallerRoleAsync(project.TeamId, userId, cancel))) return ProjectEndpoints.EditorsOnly();
        if (project.ArchivedAt is not null) return ProjectEndpoints.Archived();
        var repository = await db.ProjectRepositories.AsNoTracking().SingleOrDefaultAsync(r => r.ProjectId == projectId, cancel);
        if (repository is null) return NoRepository();
        if (await IsRecordedAsync(db, projectId, repository.RepositoryId, tag!, environment!, cancel)) return AlreadyRecorded(tag!, environment!);

        var fullName = $"{repository.Owner}/{repository.Name}";
        var found = await github.GetReleaseAsync(repository.InstallationId, repository.RepositoryId, tag!, cancel);
        if (found.Failure == GitHubFailure.NotFound)
        {
            errors.Add("tag", $"GitHub has no published release tagged {tag} in {fullName}.");
            return TypedResults.ValidationProblem(errors.ToDictionary());
        }
        if (found.Failure != GitHubFailure.None) return Failed(found.Failure, fullName);
        var item = found.Value!;
        var (contains, failure) = await CompareAsync(db, github, repository, projectId, item.Sha!, cancel);
        if (failure is not null) return failure;

        // GitHub was read without holding the team lock (ADR-048). Take it now and check again.
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var locked = await ProjectEndpoints.LockProjectForCaller(db, projectId, userId, cancel);
        if (locked is null) return TypedResults.NotFound();
        if (!TeamRoles.CanEdit(await db.CallerRoleAsync(locked.TeamId, userId, cancel))) return ProjectEndpoints.EditorsOnly();
        if (locked.ArchivedAt is not null) return ProjectEndpoints.Archived();
        if (!await StillConnectedAsync(db, projectId, repository, cancel)) return Changed();
        if (await IsRecordedAsync(db, projectId, repository.RepositoryId, item.Tag!, environment!, cancel)) return AlreadyRecorded(item.Tag!, environment!);

        var now = Clock.UtcNow();
        var release = new ProjectRelease
        {
            Id = Guid.NewGuid(),
            ProjectId = projectId,
            RepositoryId = repository.RepositoryId,
            Tag = item.Tag!,
            Name = item.Title,
            Sha = item.Sha!,
            Url = item.Url,
            Author = item.Author,
            Prerelease = item.Prerelease ?? false,
            PublishedAt = item.CreatedAt,
            Environment = environment!,
            DeployedOn = deployedOn!.Value,
            RecordedBy = userId,
            RecordedAt = now,
            Contains = JsonSerializer.Serialize(contains, Json),
            ComparedAt = now,
        };
        db.ProjectReleases.Add(release);
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Created($"/releases/{release.Id}", (await ToResponsesAsync(db, [release], cancel))[0]);
    }

    // Compares the release with every change linked in the project now, so changes linked since
    // it was recorded are included. The release itself, and who recorded it, stay as they were.
    private static async Task<Results<Ok<ReleaseResponse>, NotFound, ProblemHttpResult>> Refresh(
        Guid releaseId, ClaimsPrincipal user, SpecThreadDbContext db, IGitHubClient github, CancellationToken cancel)
    {
        var userId = user.CallerId();
        var row = await db.ProjectReleases.AsNoTracking().Where(r => r.Id == releaseId)
            .Join(db.ProjectsFor(userId), r => r.ProjectId, p => p.Id, (r, p) => new { Release = r, Project = p }).SingleOrDefaultAsync(cancel);
        if (row is null) return TypedResults.NotFound();
        if (!TeamRoles.CanEdit(await db.CallerRoleAsync(row.Project.TeamId, userId, cancel))) return ProjectEndpoints.EditorsOnly();
        if (row.Project.ArchivedAt is not null) return ProjectEndpoints.Archived();
        var repository = await db.ProjectRepositories.AsNoTracking().SingleOrDefaultAsync(r => r.ProjectId == row.Project.Id, cancel);
        if (repository is null) return NoRepository();
        if (repository.RepositoryId != row.Release.RepositoryId) return OtherRepository();

        var (contains, failure) = await CompareAsync(db, github, repository, row.Project.Id, row.Release.Sha, cancel);
        if (failure is not null) return failure;

        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var locked = await ProjectEndpoints.LockProjectForCaller(db, row.Project.Id, userId, cancel);
        if (locked is null) return TypedResults.NotFound();
        if (!TeamRoles.CanEdit(await db.CallerRoleAsync(locked.TeamId, userId, cancel))) return ProjectEndpoints.EditorsOnly();
        if (locked.ArchivedAt is not null) return ProjectEndpoints.Archived();
        if (!await StillConnectedAsync(db, row.Project.Id, repository, cancel)) return Changed();
        var release = await db.ProjectReleases.SingleAsync(r => r.Id == releaseId, cancel);
        release.Contains = JsonSerializer.Serialize(contains, Json);
        release.ComparedAt = Clock.UtcNow();
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Ok((await ToResponsesAsync(db, [release], cancel))[0]);
    }

    // Asks GitHub, once per distinct commit, whether the release's history includes each linked
    // commit and merged pull request of the connected repository in the project, archived
    // requirements included. Answers are by evidence ID.
    private static async Task<(Dictionary<Guid, bool> Contains, ProblemHttpResult? Failure)> CompareAsync(
        SpecThreadDbContext db, IGitHubClient github, ProjectRepository repository, Guid projectId, string releaseSha, CancellationToken cancel)
    {
        var changes = (await db.RequirementEvidence.AsNoTracking()
                .Where(e => e.RepositoryId == repository.RepositoryId && (e.Kind == "commit" || e.Kind == "pull_request"))
                .Join(db.Requirements.Where(r => r.ProjectId == projectId), e => e.RequirementId, r => r.Id, (e, r) => e)
                .ToListAsync(cancel))
            .Select(e => (e.Id, Sha: EvidenceEndpoints.ChangeSha(e)))
            .Where(e => e.Sha is not null)
            .ToList();
        var shas = changes.Select(e => e.Sha!).Distinct().ToList();
        if (shas.Count > MaxComparisons)
        {
            return ([], TypedResults.Problem(
                $"This project links more than {MaxComparisons} commits and merged pull requests, too many to compare with a release at once.",
                statusCode: StatusCodes.Status409Conflict));
        }
        var answers = await EvidenceEndpoints.ReadConcurrentlyAsync(shas,
            sha => github.IsAncestorAsync(repository.InstallationId, repository.RepositoryId, sha, releaseSha, cancel), cancel);
        var failed = answers.Find(answer => answer.Failure != GitHubFailure.None);
        if (failed is not null) return ([], Failed(failed.Failure, $"{repository.Owner}/{repository.Name}"));
        var included = new Dictionary<string, bool>();
        for (var index = 0; index < shas.Count; index++) included[shas[index]] = answers[index].Value;
        return (changes.ToDictionary(e => e.Id, e => included[e.Sha!]), null);
    }

    // The requirements each release includes: those with a linked change, still linked, that the
    // release's history was found to contain. A change linked after the last comparison is not
    // included until the release is refreshed.
    private static async Task<List<ReleaseResponse>> ToResponsesAsync(SpecThreadDbContext db, List<ProjectRelease> rows, CancellationToken cancel)
    {
        var maps = rows.ToDictionary(r => r.Id, r => JsonSerializer.Deserialize<Dictionary<Guid, bool>>(r.Contains, Json) ?? []);
        var ids = maps.Values.SelectMany(map => map.Where(pair => pair.Value).Select(pair => pair.Key)).Distinct().ToList();
        var projects = rows.Select(r => r.ProjectId).Distinct().ToList();
        var linked = await db.RequirementEvidence.AsNoTracking().Where(e => ids.Contains(e.Id))
            .Join(db.Requirements.Where(r => projects.Contains(r.ProjectId)), e => e.RequirementId, r => r.Id,
                (e, r) => new { Evidence = e, Requirement = r })
            .ToListAsync(cancel);
        return rows.ConvertAll(release =>
        {
            var map = maps[release.Id];
            var requirements = linked
                .Where(x => x.Requirement.ProjectId == release.ProjectId && map.GetValueOrDefault(x.Evidence.Id))
                .GroupBy(x => x.Requirement.Id)
                .Select(group => new ReleaseRequirement(group.Key, group.First().Requirement.Title, group.First().Requirement.ArchivedAt,
                    group.OrderBy(x => x.Evidence.Number is null).ThenBy(x => x.Evidence.Number).ThenBy(x => x.Evidence.Sha, StringComparer.Ordinal)
                        .Select(x => new ReleaseChange(x.Evidence.Id, x.Evidence.Kind, Label(x.Evidence), x.Evidence.Title)).ToList()))
                .OrderBy(requirement => requirement.Title, StringComparer.OrdinalIgnoreCase).ThenBy(requirement => requirement.Id)
                .ToList();
            return new ReleaseResponse(release.Id, release.ProjectId, release.Tag, release.Name, release.Url, release.Sha, release.Author,
                release.Prerelease, release.PublishedAt, release.Environment, release.DeployedOn.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                release.RecordedBy, release.RecordedAt, release.ComparedAt, map.Count, requirements);
        });
    }

    private static string Label(RequirementEvidence evidence) =>
        evidence.Number is { } number ? $"#{number}" : (evidence.Sha ?? "")[..Math.Min(7, (evidence.Sha ?? "").Length)];

    // A calendar date, yyyy-MM-dd, not after tomorrow in UTC (a deployment that already happened,
    // allowing for the recorder being a day ahead of UTC).
    private static DateOnly? ReadDate(InputErrors errors, string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            errors.Add("deployedOn", "Enter the date the release was deployed.");
            return null;
        }
        if (!DateOnly.TryParseExact(value.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        {
            errors.Add("deployedOn", "Enter the date as YYYY-MM-DD.");
            return null;
        }
        if (date > DateOnly.FromDateTime(Clock.UtcNow()).AddDays(1))
        {
            errors.Add("deployedOn", "A deployment date can't be in the future.");
            return null;
        }
        return date;
    }

    private static Task<bool> IsRecordedAsync(
        SpecThreadDbContext db, Guid projectId, long repositoryId, string tag, string environment, CancellationToken cancel) =>
        db.ProjectReleases.AnyAsync(r => r.ProjectId == projectId && r.RepositoryId == repositoryId && r.Tag == tag && r.Environment == environment, cancel);

    private static Task<bool> StillConnectedAsync(SpecThreadDbContext db, Guid projectId, ProjectRepository repository, CancellationToken cancel) =>
        db.ProjectRepositories.AnyAsync(r => r.ProjectId == projectId &&
            r.InstallationId == repository.InstallationId && r.RepositoryId == repository.RepositoryId, cancel);

    private static ProblemHttpResult NoRepository() =>
        TypedResults.Problem("Connect a GitHub repository to this project first.", statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult OtherRepository() => TypedResults.Problem(
        "This release is from a repository that is no longer connected, so it can't be compared again.", statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult AlreadyRecorded(string tag, string environment) =>
        TypedResults.Problem($"{tag} is already recorded as deployed to {environment}.", statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult Changed() => TypedResults.Problem(
        "The project's repository changed while GitHub was being read. Try again.", statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult Failed(GitHubFailure failure, string fullName) => failure == GitHubFailure.NotInstalled
        ? TypedResults.Problem($"The SpecThread app is no longer installed on {fullName}. Connect the repository again.", statusCode: StatusCodes.Status409Conflict)
        : RepositoryEndpoints.Failed(failure);
}

internal sealed record RecordReleaseRequest(string? Tag, string? Environment, string? DeployedOn);

internal sealed record ReleaseChange(Guid EvidenceId, string Kind, string Label, string Title);

internal sealed record ReleaseRequirement(Guid Id, string Title, DateTime? ArchivedAt, List<ReleaseChange> Changes);

// DeployedOn is a calendar date, yyyy-MM-dd. Compared is how many linked changes were compared
// at ComparedAt; Requirements lists those whose linked changes the release's history includes.
internal sealed record ReleaseResponse(
    Guid Id, Guid ProjectId, string Tag, string Name, string Url, string Sha, string? Author, bool Prerelease, DateTime PublishedAt,
    string Environment, string DeployedOn, string RecordedBy, DateTime RecordedAt, DateTime ComparedAt, int Compared,
    List<ReleaseRequirement> Requirements);
