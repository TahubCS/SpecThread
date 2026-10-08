using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.GitHub;

// Links GitHub issues, pull requests, commits, and releases to a requirement (ADR-033, ADR-034,
// ADR-037), with the check results of commits and of pull requests' latest commits (ADR-035)
// and, for each release, which linked commits and merged pull requests its history includes. Any project member
// links, refreshes, and unlinks. What GitHub reported is stored, so it stays inspectable later.
// Every link made here is recorded as made by a person (ADR-036).
internal static partial class EvidenceEndpoints
{
    public const int MaxEvidence = 50;
    private const int MaxReferenceLength = 300;
    private const int MaxTagLength = 100;
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
            errors.Add("reference", "Enter an issue or pull request number, a commit SHA, a release tag, or a GitHub link to one of them.");
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
        // Tracked, because linking a change updates what the linked releases contain.
        var existing = await db.RequirementEvidence.Where(e => e.RequirementId == requirementId).ToListAsync(cancel);
        var here = existing.FindAll(e => e.RepositoryId == repository.RepositoryId);
        if (reference.Number is { } number && here.Exists(e => e.Number == number)) return AlreadyLinked($"#{number}");
        if (reference.Tag is { } wanted && here.Exists(e => e.Kind == "release" && e.Tag == wanted)) return AlreadyLinked($"Release {wanted}");
        if (existing.Count >= MaxEvidence)
        {
            return TypedResults.Problem($"A requirement can have at most {MaxEvidence} evidence links.", statusCode: StatusCodes.Status409Conflict);
        }

        var found = reference switch
        {
            { Number: { } issueNumber } => await github.GetItemAsync(repository.InstallationId, repository.RepositoryId, issueNumber, cancel),
            { Sha: { } sha } => await github.GetCommitAsync(repository.InstallationId, repository.RepositoryId, sha, cancel),
            _ => await github.GetReleaseAsync(repository.InstallationId, repository.RepositoryId, reference.Tag!, cancel),
        };
        if (found.Failure == GitHubFailure.NotFound)
        {
            errors.Add("reference", reference switch
            {
                { Number: not null } => $"GitHub has no issue or pull request #{reference.Number} in {fullName}.",
                { Sha: not null } => $"GitHub has no commit {reference.Sha} in {fullName}.",
                _ => $"GitHub has no release tagged {reference.Tag} in {fullName}.",
            });
            return TypedResults.ValidationProblem(errors.ToDictionary());
        }
        if (found.Failure != GitHubFailure.None) return Failed(found.Failure, fullName);
        // An abbreviated SHA, or a tag's exact spelling, is only known once GitHub has answered.
        if (found.Value!.Kind == "commit" && here.Exists(e => e.Kind == "commit" && e.Sha == found.Value.Sha)) return AlreadyLinked(Label(found.Value));
        if (found.Value.Kind == "release" && here.Exists(e => e.Kind == "release" && e.Tag == found.Value.Tag)) return AlreadyLinked(Label(found.Value));

        var checks = await ReadChecksAsync(github, repository, found.Value.Kind, found.Value.Sha, cancel);
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

        // A new release is compared with every linked change; a new change with every linked release.
        var contents = evidence.Kind == "release"
            ? await ReadContentsAsync(github, repository, [evidence], here, cancel)
            : await ReadContentsAsync(github, repository, here.FindAll(e => e.Kind == "release"), [evidence], cancel);
        if (contents != GitHubFailure.None) return Failed(contents, fullName);

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

    // Reads every linked issue, pull request, and release of the connected repository again, the
    // check results of pull requests and commits, and what each release contains. Nothing is saved
    // unless all of them were read. A commit itself is not read again, because it never changes.
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
            if (item.Kind != "commit")
            {
                var found = item.Number is { } number
                    ? await github.GetItemAsync(repository.InstallationId, repository.RepositoryId, number, cancel)
                    : await github.GetReleaseAsync(repository.InstallationId, repository.RepositoryId, item.Tag!, cancel);
                // An item deleted or moved on GitHub keeps its last snapshot, so the record stays inspectable.
                if (found.Failure == GitHubFailure.NotFound) continue;
                if (found.Failure != GitHubFailure.None) return Failed(found.Failure, fullName);
                Apply(item, found.Value!, now);
            }
            var checks = await ReadChecksAsync(github, repository, item.Kind, item.Sha, cancel);
            if (checks.Failure is not (GitHubFailure.None or GitHubFailure.NotFound)) return Failed(checks.Failure, fullName);
            ApplyChecks(item, checks, now);
        }
        foreach (var release in items.FindAll(e => e.Kind == "release")) release.Contains = null;
        var contents = await ReadContentsAsync(github, repository, items.FindAll(e => e.Kind == "release"), items, cancel);
        if (contents != GitHubFailure.None) return Failed(contents, fullName);
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
            .OrderBy(e => e.GitHubCreatedAt).ThenBy(e => e.Number).ThenBy(e => e.Tag).ThenBy(e => e.Sha).ToListAsync(cancel)).ConvertAll(ToResponse);

    private static void Apply(RequirementEvidence evidence, GitHubItem item, DateTime now)
    {
        evidence.Kind = item.Kind;
        evidence.Sha = item.Sha;
        evidence.MergeSha = item.MergeSha;
        evidence.Tag = item.Tag;
        evidence.Prerelease = item.Prerelease;
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

    // Only commits and pull requests have checks: issues and releases are answered without asking GitHub.
    private static bool HasChecks(string kind, string? sha) => sha is not null && kind is "commit" or "pull_request";

    private static Task<GitHubResult<GitHubChecks>> ReadChecksAsync(
        IGitHubClient github, ProjectRepository repository, string kind, string? sha, CancellationToken cancel) =>
        HasChecks(kind, sha)
            ? github.GetChecksAsync(repository.InstallationId, repository.RepositoryId, sha!, cancel)
            : Task.FromResult(GitHubResult<GitHubChecks>.Fail(GitHubFailure.NotFound));

    // The commit that a release would contain: a commit itself, or a merged pull request's commit
    // on its target branch. Null for anything that cannot be in a release.
    private static string? ChangeSha(RequirementEvidence evidence) => evidence.Kind switch
    {
        "commit" => evidence.Sha,
        "pull_request" when evidence.State == "merged" => evidence.MergeSha,
        _ => null,
    };

    // Asks GitHub, for each release, whether its history includes each change, and records the
    // answers on the release. Answers already recorded for other changes are kept.
    private static async Task<GitHubFailure> ReadContentsAsync(
        IGitHubClient github, ProjectRepository repository, List<RequirementEvidence> releases, List<RequirementEvidence> changes, CancellationToken cancel)
    {
        foreach (var release in releases)
        {
            if (release.RepositoryId != repository.RepositoryId || release.Sha is null) continue;
            var contains = release.Contains is null ? [] : JsonSerializer.Deserialize<Dictionary<Guid, bool>>(release.Contains, CommitJson) ?? [];
            foreach (var change in changes)
            {
                if (change.RepositoryId != repository.RepositoryId || ChangeSha(change) is not { } sha) continue;
                var included = await github.IsAncestorAsync(repository.InstallationId, repository.RepositoryId, sha, release.Sha, cancel);
                if (included.Failure != GitHubFailure.None) return included.Failure;
                contains[change.Id] = included.Value;
            }
            release.Contains = JsonSerializer.Serialize(contains, CommitJson);
        }
        return GitHubFailure.None;
    }

    // Stores what was read. Checks GitHub would not let the app read are stored as null, with the time of the attempt.
    private static void ApplyChecks(RequirementEvidence evidence, GitHubResult<GitHubChecks> checks, DateTime now)
    {
        if (!HasChecks(evidence.Kind, evidence.Sha))
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

    // Accepts, in this order: "42" or "#42"; a commit SHA of 7 to 40 hex digits; a github.com link
    // to an issue, pull request, commit, or release; and any other text without spaces, which is
    // read as a release tag. So a tag made only of digits, or one that looks like a SHA, has to be
    // given as its release link. Null when it is none of these.
    internal static EvidenceReference? ParseReference(string text)
    {
        var plain = NumberPattern().Match(text);
        if (plain.Success) return int.TryParse(plain.Groups[1].ValueSpan, out var number) && number > 0 ? new EvidenceReference(number, null, null, null) : null;
        if (ShaPattern().IsMatch(text)) return new EvidenceReference(null, text.ToLowerInvariant(), null, null);

        var link = LinkPattern().Match(text);
        if (link.Success)
        {
            return int.TryParse(link.Groups[3].ValueSpan, out var linked) && linked > 0
                ? new EvidenceReference(linked, null, null, $"{link.Groups[1].Value}/{link.Groups[2].Value}")
                : null;
        }
        var commit = CommitLinkPattern().Match(text);
        if (commit.Success)
        {
            return new EvidenceReference(null, commit.Groups[3].Value.ToLowerInvariant(), null, $"{commit.Groups[1].Value}/{commit.Groups[2].Value}");
        }
        var release = ReleaseLinkPattern().Match(text);
        if (release.Success)
        {
            var tag = Uri.UnescapeDataString(release.Groups[3].Value);
            return IsTag(tag) ? new EvidenceReference(null, null, tag, $"{release.Groups[1].Value}/{release.Groups[2].Value}") : null;
        }
        // Anything that looks like a link was meant as one, and none of the known kinds matched.
        return IsTag(text) && !text.Contains("://", StringComparison.Ordinal) ? new EvidenceReference(null, null, text, null) : null;
    }

    private static bool IsTag(string text) => text.Length is > 0 and <= MaxTagLength && !text.Any(c => char.IsWhiteSpace(c) || char.IsControl(c));

    [GeneratedRegex(@"^#?(\d{1,9})$")]
    private static partial Regex NumberPattern();

    [GeneratedRegex(@"^[0-9a-fA-F]{7,40}$")]
    private static partial Regex ShaPattern();

    [GeneratedRegex(@"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/(?:issues|pull)/(\d{1,9})(?:[/?#](?!commits/).*)?$")]
    private static partial Regex LinkPattern();

    // A commit's own page, or a commit opened from inside a pull request.
    [GeneratedRegex(@"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/(?:commit|pull/\d{1,9}/commits)/([0-9a-fA-F]{7,40})(?:[/?#].*)?$")]
    private static partial Regex CommitLinkPattern();

    // A release's page. The tag may contain slashes and percent-encoded characters.
    [GeneratedRegex(@"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/releases/tag/([^?#\s]+)(?:[?#].*)?$")]
    private static partial Regex ReleaseLinkPattern();

    private static string Label(GitHubItem item) => item switch
    {
        { Number: { } number } => $"#{number}",
        { Kind: "release" } => $"Release {item.Tag}",
        _ => $"Commit {item.Sha![..7]}",
    };

    private static ProblemHttpResult NoRepository() =>
        TypedResults.Problem("Connect a GitHub repository to this project first.", statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult AlreadyLinked(string label) =>
        TypedResults.Problem($"{label} is already linked to this requirement.", statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult Failed(GitHubFailure failure, string fullName) => failure == GitHubFailure.NotInstalled
        ? TypedResults.Problem($"The SpecThread app is no longer installed on {fullName}. Connect the repository again.", statusCode: StatusCodes.Status409Conflict)
        : RepositoryEndpoints.Failed(failure);

    private static EvidenceResponse ToResponse(RequirementEvidence e) => new(
        e.Id, e.RequirementId, e.Kind, e.Number, e.Sha, e.Tag, e.Prerelease, e.Title, e.State, e.Author, e.Url, $"{e.RepositoryOwner}/{e.RepositoryName}",
        e.GitHubCreatedAt, e.GitHubUpdatedAt, e.GitHubClosedAt, e.Additions, e.Deletions, e.ChangedFiles, e.CommitCount,
        e.Commits is null ? null : JsonSerializer.Deserialize<List<EvidenceCommit>>(e.Commits, CommitJson),
        e.Checks is null ? null : JsonSerializer.Deserialize<List<EvidenceCheck>>(e.Checks, CommitJson), e.CheckCount, e.ChecksReadAt,
        e.Contains is null ? null : JsonSerializer.Deserialize<Dictionary<Guid, bool>>(e.Contains, CommitJson),
        e.Source, e.LinkedBy, e.LinkedAt, e.RefreshedAt);

    private sealed record Scope(Guid ProjectId, bool Archived);
}

internal sealed record EvidenceReference(int? Number, string? Sha, string? Tag, string? Repository);

internal sealed record LinkEvidenceRequest(string? Reference);

internal sealed record EvidenceCommit(string Sha, string Message, string? Author, DateTime Date, string Url);

internal sealed record EvidenceCheck(string Name, string Result, string? Url, DateTime? CompletedAt, string Kind);

internal sealed record EvidenceResponse(
    Guid Id, Guid RequirementId, string Kind, int? Number, string? Sha, string? Tag, bool? Prerelease,
    string Title, string? State, string? Author, string Url, string Repository,
    DateTime GithubCreatedAt, DateTime GithubUpdatedAt, DateTime? GithubClosedAt,
    int? Additions, int? Deletions, int? ChangedFiles, int? CommitCount, List<EvidenceCommit>? Commits,
    List<EvidenceCheck>? Checks, int? CheckCount, DateTime? ChecksReadAt, Dictionary<Guid, bool>? Contains,
    string Source, string LinkedBy, DateTime LinkedAt, DateTime RefreshedAt);
