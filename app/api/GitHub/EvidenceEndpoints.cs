using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.GitHub;

// Links GitHub issues, pull requests, and commits to a requirement (ADR-033, ADR-034), with the
// check results of commits and of pull requests' latest commits (ADR-035). Any project member
// links, refreshes, and unlinks. What GitHub reported is stored, so it stays inspectable later.
// Every link made here is recorded as made by a person (ADR-036).
internal static partial class EvidenceEndpoints
{
    public const int MaxEvidence = 50;
    private const int MaxReferenceLength = 300;
    private static readonly JsonSerializerOptions CommitJson = new(JsonSerializerDefaults.Web);

    public static void MapEvidenceEndpoints(this IEndpointRouteBuilder app)
    {
        var evidence = app.MapGroup("/requirements/{requirementId:guid}/evidence").WithTags("Evidence")
            .WithMetadata(ProjectEndpoints.Unauthorized);
        evidence.MapGet("/", List).WithName("ListEvidence");
        evidence.MapPost("/", Link).WithName("LinkEvidence")
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status502BadGateway).ProducesProblem(StatusCodes.Status503ServiceUnavailable);
        evidence.MapPost("/refresh", Refresh).WithName("RefreshEvidence")
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status502BadGateway).ProducesProblem(StatusCodes.Status503ServiceUnavailable);
        evidence.MapDelete("/{evidenceId:guid}", Unlink).WithName("UnlinkEvidence")
            .ProducesProblem(StatusCodes.Status409Conflict);
    }

    private static async Task<Results<Ok<List<EvidenceResponse>>, NotFound>> List(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (await FindAsync(db, user.CallerId(), requirementId, cancel) is null) return TypedResults.NotFound();
        return TypedResults.Ok(await ReadAsync(db, requirementId, cancel));
    }

    private static async Task<Results<Created<EvidenceResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Link(
        Guid requirementId, LinkEvidenceRequest request, ClaimsPrincipal user, SpecThreadDbContext db, IGitHubClient github, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var text = errors.Required("reference", request.Reference, MaxReferenceLength);
        var reference = text is null ? null : ParseReference(text);
        if (text is not null && reference is null)
        {
            errors.Add("reference", "Enter an issue or pull request number, a commit SHA, or a GitHub link to one of them.");
        }
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var userId = user.CallerId();
        var scope = await FindAsync(db, userId, requirementId, cancel);
        if (scope is null) return TypedResults.NotFound();
        if (scope.Archived) return ProjectEndpoints.Archived();
        var repository = await db.ProjectRepositories.AsNoTracking().SingleOrDefaultAsync(r => r.ProjectId == scope.ProjectId, cancel);
        if (repository is null) return NoRepository();

        var fullName = $"{repository.Owner}/{repository.Name}";
        if (reference!.Repository is not null && !string.Equals(reference.Repository, fullName, StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("reference", $"That link is not in {fullName}, the repository connected to this project.");
            return TypedResults.ValidationProblem(errors.ToDictionary());
        }
        var existing = await db.RequirementEvidence.AsNoTracking().Where(e => e.RequirementId == requirementId)
            .Select(e => new { e.RepositoryId, e.Kind, e.Number, e.Sha }).ToListAsync(cancel);
        var here = existing.FindAll(e => e.RepositoryId == repository.RepositoryId);
        if (reference.Number is { } number && here.Exists(e => e.Number == number)) return AlreadyLinked($"#{number}");
        if (existing.Count >= MaxEvidence)
        {
            return TypedResults.Problem($"A requirement can have at most {MaxEvidence} evidence links.", statusCode: StatusCodes.Status409Conflict);
        }

        var found = reference.Number is { } issueNumber
            ? await github.GetItemAsync(repository.InstallationId, repository.RepositoryId, issueNumber, cancel)
            : await github.GetCommitAsync(repository.InstallationId, repository.RepositoryId, reference.Sha!, cancel);
        if (found.Failure == GitHubFailure.NotFound)
        {
            errors.Add("reference", reference.Number is null
                ? $"GitHub has no commit {reference.Sha} in {fullName}."
                : $"GitHub has no issue or pull request #{reference.Number} in {fullName}.");
            return TypedResults.ValidationProblem(errors.ToDictionary());
        }
        if (found.Failure != GitHubFailure.None) return Failed(found.Failure, fullName);
        // An abbreviated SHA is only known in full once GitHub has answered.
        if (found.Value!.Kind == "commit" && here.Exists(e => e.Kind == "commit" && e.Sha == found.Value.Sha)) return AlreadyLinked(Label(found.Value));

        var checks = await ReadChecksAsync(github, repository, found.Value.Sha, cancel);
        if (checks.Failure is not (GitHubFailure.None or GitHubFailure.NotFound)) return Failed(checks.Failure, fullName);

        var now = Clock.UtcNow();
        var evidence = new RequirementEvidence
        {
            Id = Guid.NewGuid(),
            RequirementId = requirementId,
            Kind = found.Value.Kind,
            RepositoryId = repository.RepositoryId,
            RepositoryOwner = repository.Owner,
            RepositoryName = repository.Name,
            Number = found.Value.Number,
            Title = "",
            Url = "",
            LinkedBy = userId,
            LinkedAt = now,
            Source = "manual",
        };
        Apply(evidence, found.Value, now);
        ApplyChecks(evidence, checks, now);
        db.RequirementEvidence.Add(evidence);
        try
        {
            await db.SaveChangesAsync(cancel);
        }
        catch (DbUpdateException)
        {
            // Two links of the same item at once: a unique index refused this one.
            return AlreadyLinked(Label(found.Value));
        }
        return TypedResults.Created($"/requirements/{requirementId}/evidence/{evidence.Id}", ToResponse(evidence));
    }

    // Reads every linked issue and pull request of the connected repository again, and the check
    // results of pull requests and commits. Nothing is saved unless all of them were read. A
    // commit itself is not read again, because it never changes; only its checks are.
    private static async Task<Results<Ok<List<EvidenceResponse>>, NotFound, ProblemHttpResult>> Refresh(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, IGitHubClient github, CancellationToken cancel)
    {
        var scope = await FindAsync(db, user.CallerId(), requirementId, cancel);
        if (scope is null) return TypedResults.NotFound();
        if (scope.Archived) return ProjectEndpoints.Archived();
        var repository = await db.ProjectRepositories.AsNoTracking().SingleOrDefaultAsync(r => r.ProjectId == scope.ProjectId, cancel);
        if (repository is null) return NoRepository();

        // Items linked from a repository connected earlier keep their last snapshot.
        var items = await db.RequirementEvidence
            .Where(e => e.RequirementId == requirementId && e.RepositoryId == repository.RepositoryId).ToListAsync(cancel);
        var fullName = $"{repository.Owner}/{repository.Name}";
        var now = Clock.UtcNow();
        foreach (var item in items)
        {
            if (item.Number is { } number)
            {
                var found = await github.GetItemAsync(repository.InstallationId, repository.RepositoryId, number, cancel);
                // An item deleted or moved on GitHub keeps its last snapshot, so the record stays inspectable.
                if (found.Failure == GitHubFailure.NotFound) continue;
                if (found.Failure != GitHubFailure.None) return Failed(found.Failure, fullName);
                Apply(item, found.Value!, now);
            }
            var checks = await ReadChecksAsync(github, repository, item.Sha, cancel);
            if (checks.Failure is not (GitHubFailure.None or GitHubFailure.NotFound)) return Failed(checks.Failure, fullName);
            ApplyChecks(item, checks, now);
        }
        await db.SaveChangesAsync(cancel);
        return TypedResults.Ok(await ReadAsync(db, requirementId, cancel));
    }

    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Unlink(
        Guid requirementId, Guid evidenceId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var scope = await FindAsync(db, user.CallerId(), requirementId, cancel);
        if (scope is null) return TypedResults.NotFound();
        if (scope.Archived) return ProjectEndpoints.Archived();
        var deleted = await db.RequirementEvidence.Where(e => e.Id == evidenceId && e.RequirementId == requirementId).ExecuteDeleteAsync(cancel);
        return deleted == 0 ? TypedResults.NotFound() : TypedResults.NoContent();
    }

    // Null when the requirement does not exist or the caller is not a member of its project.
    private static Task<Scope?> FindAsync(SpecThreadDbContext db, string userId, Guid requirementId, CancellationToken cancel) =>
        db.Requirements.AsNoTracking().Where(r => r.Id == requirementId)
            .Join(db.ProjectsFor(userId), r => r.ProjectId, p => p.Id, (r, p) => new Scope(p.Id, r.ArchivedAt != null || p.ArchivedAt != null))
            .SingleOrDefaultAsync(cancel);

    // Oldest first by GitHub's own date, so the list reads as a timeline.
    private static async Task<List<EvidenceResponse>> ReadAsync(SpecThreadDbContext db, Guid requirementId, CancellationToken cancel) =>
        (await db.RequirementEvidence.AsNoTracking().Where(e => e.RequirementId == requirementId)
            .OrderBy(e => e.GitHubCreatedAt).ThenBy(e => e.Number).ThenBy(e => e.Sha).ToListAsync(cancel)).ConvertAll(ToResponse);

    private static void Apply(RequirementEvidence evidence, GitHubItem item, DateTime now)
    {
        evidence.Kind = item.Kind;
        evidence.Sha = item.Sha;
        evidence.Title = item.Title;
        evidence.State = item.State;
        evidence.Author = item.Author;
        evidence.Url = item.Url;
        evidence.GitHubCreatedAt = item.CreatedAt;
        evidence.GitHubUpdatedAt = item.UpdatedAt;
        evidence.GitHubClosedAt = item.ClosedAt;
        evidence.Additions = item.Changes?.Additions;
        evidence.Deletions = item.Changes?.Deletions;
        evidence.ChangedFiles = item.Changes?.ChangedFiles;
        evidence.CommitCount = item.Changes?.CommitCount;
        evidence.Commits = item.Commits is null
            ? null
            : JsonSerializer.Serialize(item.Commits.ConvertAll(c => new EvidenceCommit(c.Sha, c.Message, c.Author, c.Date, c.Url)), CommitJson);
        evidence.RefreshedAt = now;
    }

    // Issues have no commit and so no checks: they are answered without asking GitHub.
    private static Task<GitHubResult<GitHubChecks>> ReadChecksAsync(IGitHubClient github, ProjectRepository repository, string? sha, CancellationToken cancel) =>
        sha is null
            ? Task.FromResult(GitHubResult<GitHubChecks>.Fail(GitHubFailure.NotFound))
            : github.GetChecksAsync(repository.InstallationId, repository.RepositoryId, sha, cancel);

    // Stores what was read. Checks GitHub would not let the app read are stored as null, with the time of the attempt.
    private static void ApplyChecks(RequirementEvidence evidence, GitHubResult<GitHubChecks> checks, DateTime now)
    {
        if (evidence.Sha is null)
        {
            (evidence.Checks, evidence.CheckCount, evidence.ChecksReadAt) = (null, null, null);
            return;
        }
        evidence.Checks = checks.Value is null
            ? null
            : JsonSerializer.Serialize(checks.Value.Items.ConvertAll(c => new EvidenceCheck(c.Name, c.Result, c.Url, c.CompletedAt, c.Kind)), CommitJson);
        evidence.CheckCount = checks.Value?.Total;
        evidence.ChecksReadAt = now;
    }

    // Accepts "42", "#42", a commit SHA of 7 to 40 hex digits, or a github.com link to an issue,
    // pull request, or commit. Digits alone are read as a number. Null when it is none of these.
    internal static EvidenceReference? ParseReference(string text)
    {
        var plain = NumberPattern().Match(text);
        if (plain.Success) return int.TryParse(plain.Groups[1].ValueSpan, out var number) && number > 0 ? new EvidenceReference(number, null, null) : null;
        if (ShaPattern().IsMatch(text)) return new EvidenceReference(null, text.ToLowerInvariant(), null);

        var link = LinkPattern().Match(text);
        if (link.Success)
        {
            return int.TryParse(link.Groups[3].ValueSpan, out var linked) && linked > 0
                ? new EvidenceReference(linked, null, $"{link.Groups[1].Value}/{link.Groups[2].Value}")
                : null;
        }
        var commit = CommitLinkPattern().Match(text);
        return commit.Success
            ? new EvidenceReference(null, commit.Groups[3].Value.ToLowerInvariant(), $"{commit.Groups[1].Value}/{commit.Groups[2].Value}")
            : null;
    }

    [GeneratedRegex(@"^#?(\d{1,9})$")]
    private static partial Regex NumberPattern();

    [GeneratedRegex(@"^[0-9a-fA-F]{7,40}$")]
    private static partial Regex ShaPattern();

    [GeneratedRegex(@"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/(?:issues|pull)/(\d{1,9})(?:[/?#](?!commits/).*)?$")]
    private static partial Regex LinkPattern();

    // A commit's own page, or a commit opened from inside a pull request.
    [GeneratedRegex(@"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/(?:commit|pull/\d{1,9}/commits)/([0-9a-fA-F]{7,40})(?:[/?#].*)?$")]
    private static partial Regex CommitLinkPattern();

    private static string Label(GitHubItem item) => item.Number is { } number ? $"#{number}" : $"Commit {item.Sha![..7]}";

    private static ProblemHttpResult NoRepository() =>
        TypedResults.Problem("Connect a GitHub repository to this project first.", statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult AlreadyLinked(string label) =>
        TypedResults.Problem($"{label} is already linked to this requirement.", statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult Failed(GitHubFailure failure, string fullName) => failure == GitHubFailure.NotInstalled
        ? TypedResults.Problem($"The SpecThread app is no longer installed on {fullName}. Connect the repository again.", statusCode: StatusCodes.Status409Conflict)
        : RepositoryEndpoints.Failed(failure);

    private static EvidenceResponse ToResponse(RequirementEvidence e) => new(
        e.Id, e.RequirementId, e.Kind, e.Number, e.Sha, e.Title, e.State, e.Author, e.Url, $"{e.RepositoryOwner}/{e.RepositoryName}",
        e.GitHubCreatedAt, e.GitHubUpdatedAt, e.GitHubClosedAt, e.Additions, e.Deletions, e.ChangedFiles, e.CommitCount,
        e.Commits is null ? null : JsonSerializer.Deserialize<List<EvidenceCommit>>(e.Commits, CommitJson),
        e.Checks is null ? null : JsonSerializer.Deserialize<List<EvidenceCheck>>(e.Checks, CommitJson), e.CheckCount, e.ChecksReadAt,
        e.Source, e.LinkedBy, e.LinkedAt, e.RefreshedAt);

    private sealed record Scope(Guid ProjectId, bool Archived);
}

internal sealed record EvidenceReference(int? Number, string? Sha, string? Repository);

internal sealed record LinkEvidenceRequest(string? Reference);

internal sealed record EvidenceCommit(string Sha, string Message, string? Author, DateTime Date, string Url);

internal sealed record EvidenceCheck(string Name, string Result, string? Url, DateTime? CompletedAt, string Kind);

internal sealed record EvidenceResponse(
    Guid Id, Guid RequirementId, string Kind, int? Number, string? Sha, string Title, string? State, string? Author, string Url, string Repository,
    DateTime GithubCreatedAt, DateTime GithubUpdatedAt, DateTime? GithubClosedAt,
    int? Additions, int? Deletions, int? ChangedFiles, int? CommitCount, List<EvidenceCommit>? Commits,
    List<EvidenceCheck>? Checks, int? CheckCount, DateTime? ChecksReadAt,
    string Source, string LinkedBy, DateTime LinkedAt, DateTime RefreshedAt);
