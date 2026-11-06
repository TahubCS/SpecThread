using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;
using SpecThread.Api.Requirements;

namespace SpecThread.Api.GitHub;

// Suggests pull requests that say they close a linked issue, which a person confirms or rejects,
// and moves a link to another requirement of the project (ADR-056). A suggestion is not evidence
// until it is confirmed (ADR-036).
internal static partial class EvidenceEndpoints
{
    public const int MaxSuggestions = 50;

    private static void MapSuggestions(RouteGroupBuilder evidence)
    {
        evidence.MapGet("/suggestions", ListSuggestions).WithName("ListEvidenceSuggestions");
        evidence.MapPost("/suggestions/scan", ScanSuggestions).WithName("ScanEvidenceSuggestions")
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status502BadGateway).ProducesProblem(StatusCodes.Status503ServiceUnavailable);
        evidence.MapPost("/suggestions/{suggestionId:guid}/confirm", ConfirmSuggestion).WithName("ConfirmEvidenceSuggestion")
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status502BadGateway).ProducesProblem(StatusCodes.Status503ServiceUnavailable);
        evidence.MapPost("/suggestions/{suggestionId:guid}/reject", RejectSuggestion).WithName("RejectEvidenceSuggestion")
            .ProducesProblem(StatusCodes.Status409Conflict);
    }

    // Undecided suggestions from the connected repository, by number.
    private static async Task<Results<Ok<List<EvidenceSuggestionResponse>>, NotFound>> ListSuggestions(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var scope = await FindAsync(db, user.CallerId(), requirementId, cancel);
        if (scope is null) return TypedResults.NotFound();
        return TypedResults.Ok(await ReadSuggestionsAsync(db, requirementId, scope.ProjectId, cancel));
    }

    private static async Task<Results<Ok<List<EvidenceSuggestionResponse>>, NotFound, ProblemHttpResult>> ScanSuggestions(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, IGitHubClient github, CancellationToken cancel)
    {
        var userId = user.CallerId();
        var scope = await FindAsync(db, userId, requirementId, cancel);
        if (scope is null) return TypedResults.NotFound();
        if (scope.Archived) return ProjectEndpoints.Archived();
        var repository = await db.ProjectRepositories.AsNoTracking().SingleOrDefaultAsync(r => r.ProjectId == scope.ProjectId, cancel);
        if (repository is null) return NoRepository();

        var links = await db.RequirementEvidence.AsNoTracking()
            .Where(e => e.RequirementId == requirementId && e.RepositoryId == repository.RepositoryId).ToListAsync(cancel);
        var mentions = await ReadMentionsAsync(github, repository, links, cancel);
        if (mentions.Failure != GitHubFailure.None) return Failed(mentions.Failure, $"{repository.Owner}/{repository.Name}");

        // GitHub was read without holding the team lock. Take it now and check again what the reads relied on.
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        switch (await LockAndRecheckAsync(db, userId, requirementId, repository, cancel))
        {
            case Recheck.NotFound: return TypedResults.NotFound();
            case Recheck.Archived: return ProjectEndpoints.Archived();
            case Recheck.Changed: return Changed();
        }
        if (!await SaveSuggestionsAsync(db, requirementId, repository, mentions.Value!, Clock.UtcNow(), cancel)) return Changed();
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Ok(await ReadSuggestionsAsync(db, requirementId, scope.ProjectId, cancel));
    }

    // Links the pull request as GitHub reports it now, like any link, marked as a confirmed suggestion.
    private static async Task<Results<Created<EvidenceResponse>, NotFound, ProblemHttpResult>> ConfirmSuggestion(
        Guid requirementId, Guid suggestionId, ClaimsPrincipal user, SpecThreadDbContext db, IGitHubClient github, CancellationToken cancel)
    {
        var userId = user.CallerId();
        var scope = await FindAsync(db, userId, requirementId, cancel);
        if (scope is null) return TypedResults.NotFound();
        if (scope.Archived) return ProjectEndpoints.Archived();
        var suggestion = await db.RequirementEvidenceSuggestions.AsNoTracking()
            .SingleOrDefaultAsync(s => s.Id == suggestionId && s.RequirementId == requirementId, cancel);
        if (suggestion is null) return TypedResults.NotFound();
        if (suggestion.Status != "pending") return AlreadyDecided();
        var repository = await db.ProjectRepositories.AsNoTracking().SingleOrDefaultAsync(r => r.ProjectId == scope.ProjectId, cancel);
        if (repository is null) return NoRepository();
        if (repository.RepositoryId != suggestion.RepositoryId) return Changed();

        // Tracked, because linking a change updates what the linked releases contain.
        var existing = await db.RequirementEvidence.Where(e => e.RequirementId == requirementId).ToListAsync(cancel);
        var here = existing.FindAll(e => e.RepositoryId == repository.RepositoryId);
        if (here.Exists(e => e.Number == suggestion.Number)) return AlreadyLinked($"#{suggestion.Number}");
        if (existing.Count >= MaxEvidence) return LimitReached();

        var found = await github.GetItemAsync(repository.InstallationId, repository.RepositoryId, suggestion.Number, cancel);
        if (found.Failure == GitHubFailure.NotFound)
        {
            return TypedResults.Problem($"GitHub no longer has #{suggestion.Number} in {repository.Owner}/{repository.Name}.", statusCode: StatusCodes.Status409Conflict);
        }
        if (found.Failure != GitHubFailure.None) return Failed(found.Failure, $"{repository.Owner}/{repository.Name}");

        var saved = await SaveLinkAsync(db, github, repository, requirementId, userId, here, found.Value!, "suggested", "confirmed", async (_, now) =>
        {
            var pending = await db.RequirementEvidenceSuggestions.SingleOrDefaultAsync(s => s.Id == suggestionId && s.Status == "pending", cancel);
            if (pending is null) return AlreadyDecided();
            (pending.Status, pending.DecidedBy, pending.DecidedAt) = ("confirmed", userId, now);
            return null;
        }, cancel);
        if (saved.Problem is not null) return saved.Problem;
        if (saved.Evidence is null) return TypedResults.NotFound();
        return TypedResults.Created($"/requirements/{requirementId}/evidence/{saved.Evidence.Id}", ToResponse(saved.Evidence));
    }

    // The row stays, so the pull request is not suggested for this requirement again. It can still be linked by hand.
    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> RejectSuggestion(
        Guid requirementId, Guid suggestionId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var userId = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var found = await RequirementEndpoints.LockForMember(db, userId, requirementId, cancel);
        if (found is null) return TypedResults.NotFound();
        if (found.Archived) return ProjectEndpoints.Archived();
        var suggestion = await db.RequirementEvidenceSuggestions.SingleOrDefaultAsync(s => s.Id == suggestionId && s.RequirementId == requirementId, cancel);
        if (suggestion is null) return TypedResults.NotFound();
        if (suggestion.Status != "pending") return AlreadyDecided();

        var now = Clock.UtcNow();
        (suggestion.Status, suggestion.DecidedBy, suggestion.DecidedAt) = ("rejected", userId, now);
        db.RequirementEvidenceEvents.Add(new RequirementEvidenceEvent
        {
            Id = Guid.NewGuid(),
            RequirementId = requirementId,
            EvidenceId = suggestion.Id,
            Action = "rejected",
            Kind = "pull_request",
            Label = $"#{suggestion.Number}",
            Title = suggestion.Title,
            Actor = userId,
            OccurredAt = now,
        });
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.NoContent();
    }

    // Moves a link to another active requirement of the project in one step, so it is never on
    // both or neither. The link keeps its ID, so each requirement's decisions become outdated
    // (ADR-038); both histories show the move. A pull request is not suggested again for the
    // requirement it left, because a person has just said it does not belong there.
    private static async Task<Results<Ok<EvidenceResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Move(
        Guid requirementId, Guid evidenceId, MoveEvidenceRequest request, ClaimsPrincipal user, SpecThreadDbContext db, IGitHubClient github, CancellationToken cancel)
    {
        if (request.TargetRequirementId is not Guid targetId || targetId == Guid.Empty) return InvalidTarget("Choose a requirement.");
        if (targetId == requirementId) return InvalidTarget("This link is already on that requirement.");

        var userId = user.CallerId();
        var scope = await FindAsync(db, userId, requirementId, cancel);
        if (scope is null) return TypedResults.NotFound();
        if (scope.Archived) return ProjectEndpoints.Archived();
        var evidence = await db.RequirementEvidence.SingleOrDefaultAsync(e => e.Id == evidenceId && e.RequirementId == requirementId, cancel);
        if (evidence is null) return TypedResults.NotFound();
        var target = await db.Requirements.AsNoTracking().SingleOrDefaultAsync(r => r.Id == targetId && r.ProjectId == scope.ProjectId, cancel);
        if (target is null) return InvalidTarget("Choose a requirement in this project.");
        if (target.ArchivedAt is not null) return TypedResults.Problem("A link can't be moved to an archived requirement.", statusCode: StatusCodes.Status409Conflict);

        // Tracked, because the move updates what the target's releases contain.
        var others = await db.RequirementEvidence.Where(e => e.RequirementId == targetId).ToListAsync(cancel);
        if (others.Exists(e => SameItem(e, evidence))) return AlreadyLinkedThere(evidence);
        if (others.Count >= MaxEvidence) return LimitReached();
        // Without a repository, links can't be changed, and nothing could compare the move with releases.
        var repository = await db.ProjectRepositories.AsNoTracking().SingleOrDefaultAsync(r => r.ProjectId == scope.ProjectId, cancel);
        if (repository is null) return NoRepository();

        // What the comparison below relies on, taken before it changes the tracked releases.
        var compared = Comparable(others);
        // What a release contains was compared with the links of the requirement it was on.
        if (evidence.Kind == "release") evidence.Contains = null;
        var contents = evidence.Kind == "release"
            ? await ReadContentsAsync(github, repository, [evidence], others, cancel)
            : await ReadContentsAsync(github, repository, others.FindAll(e => e.Kind == "release"), [evidence], cancel);
        if (contents != GitHubFailure.None) return Failed(contents, $"{repository.Owner}/{repository.Name}");

        // GitHub was read without holding the team lock. Take it now and check again what the reads relied on.
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        switch (await LockAndRecheckAsync(db, userId, requirementId, repository, cancel))
        {
            case Recheck.NotFound: return TypedResults.NotFound();
            case Recheck.Archived: return ProjectEndpoints.Archived();
            case Recheck.Changed: return Changed();
        }
        if (!await db.Requirements.AnyAsync(r => r.Id == targetId && r.ProjectId == scope.ProjectId && r.ArchivedAt == null, cancel))
        {
            return TypedResults.Problem("A link can't be moved to an archived requirement.", statusCode: StatusCodes.Status409Conflict);
        }
        // Moved or removed by someone else meanwhile: this move would write over that.
        if (!await db.RequirementEvidence.AsNoTracking().AnyAsync(e => e.Id == evidenceId && e.RequirementId == requirementId, cancel)) return Changed();
        // The target's links changed meanwhile: the comparison is out of date, and saving it would
        // overwrite newer answers. An unchanged target also still has room for this link.
        var current = await db.RequirementEvidence.AsNoTracking().Where(e => e.RequirementId == targetId).ToListAsync(cancel);
        if (!Comparable(current).SequenceEqual(compared)) return Changed();

        var now = Clock.UtcNow();
        Record(db, evidence, "moved_out", userId, now, requirementId, targetId);
        Record(db, evidence, "moved_in", userId, now, targetId, requirementId);
        (evidence.RequirementId, evidence.LinkedBy, evidence.LinkedAt, evidence.Source) = (targetId, userId, now, "manual");
        if (evidence.Number is { } number)
        {
            await DropPendingAsync(db, targetId, evidence.RepositoryId, number, cancel);
            if (evidence.Kind == "pull_request") await RefuseSuggestionAsync(db, requirementId, evidence, number, userId, now, cancel);
        }
        try
        {
            await db.SaveChangesAsync(cancel);
        }
        catch (DbUpdateConcurrencyException)
        {
            // The link was removed while GitHub was being read.
            return Changed();
        }
        catch (DbUpdateException)
        {
            // The same item was linked to the target at the same moment: a unique index refused this one.
            return AlreadyLinkedThere(evidence);
        }
        await transaction.CommitAsync(cancel);
        return TypedResults.Ok(ToResponse(evidence));
    }

    // Reads, for each linked issue, the pull requests that say they close it. Issues GitHub can't
    // show are skipped, like items deleted there on refresh. Reads must not touch the DbContext.
    private static async Task<GitHubResult<EvidenceMentions>> ReadMentionsAsync(
        IGitHubClient github, ProjectRepository repository, List<RequirementEvidence> links, CancellationToken cancel)
    {
        var issues = links.FindAll(e => e.Kind == "issue" && e.Number is not null);
        var reads = await ReadConcurrentlyAsync(issues, issue => github.ListMentionsAsync(
            repository.InstallationId, repository.RepositoryId, repository.Owner, repository.Name, issue.Number!.Value, cancel), cancel);
        var found = new List<EvidenceMention>();
        var complete = true;
        for (var index = 0; index < issues.Count; index++)
        {
            if (reads[index].Failure == GitHubFailure.NotFound) continue;
            if (reads[index].Failure != GitHubFailure.None) return GitHubResult<EvidenceMentions>.Fail(reads[index].Failure);
            complete &= !reads[index].Value!.Truncated;
            foreach (var pull in reads[index].Value!.Items)
            {
                if (ClosingKeyword(pull.Body, repository, issues[index].Number!.Value) is { } keyword)
                {
                    found.Add(new EvidenceMention(pull, $"{keyword} #{issues[index].Number}"));
                }
            }
        }
        return GitHubResult<EvidenceMentions>.Ok(new EvidenceMentions(found, complete, [.. issues.Select(issue => issue.Number!.Value)]));
    }

    // The keyword with which the text closes the issue, as GitHub reads closing references: "#N",
    // "owner/name#N", or the issue's address. Null when it only mentions it.
    private static string? ClosingKeyword(string text, ProjectRepository repository, int issue)
    {
        foreach (Match match in ClosingPattern().Matches(text))
        {
            var (owner, name) = (match.Groups["owner"], match.Groups["name"]);
            var here = !owner.Success || (string.Equals(owner.Value, repository.Owner, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(name.Value, repository.Name, StringComparison.OrdinalIgnoreCase));
            if (here && int.TryParse(match.Groups["number"].ValueSpan, out var number) && number == issue)
            {
                var keyword = match.Groups["keyword"].Value.ToLowerInvariant();
                return char.ToUpperInvariant(keyword[0]) + keyword[1..];
            }
        }
        return null;
    }

    // Brings the undecided suggestions in line with a read: new ones are added, and decided ones
    // are left as they are. Ones no longer referenced go, unless the read stopped early and so can't
    // tell. Saves nothing and returns false when the linked issues are not the ones read, because
    // the read then answers for other links. Call under the team lock.
    private static async Task<bool> SaveSuggestionsAsync(
        SpecThreadDbContext db, Guid requirementId, ProjectRepository repository, EvidenceMentions mentions, DateTime now, CancellationToken cancel)
    {
        var known = await db.RequirementEvidenceSuggestions
            .Where(s => s.RequirementId == requirementId && s.RepositoryId == repository.RepositoryId).ToListAsync(cancel);
        var links = await db.RequirementEvidence.AsNoTracking()
            .Where(e => e.RequirementId == requirementId && e.RepositoryId == repository.RepositoryId && e.Number != null)
            .Select(e => new { e.Kind, Number = e.Number!.Value }).ToListAsync(cancel);
        if (!links.Where(e => e.Kind == "issue").Select(e => e.Number).ToHashSet().SetEquals(mentions.Issues)) return false;

        var linked = links.Select(e => e.Number).ToHashSet();
        var wanted = mentions.Items.Where(m => !linked.Contains(m.Pull.Number)).DistinctBy(m => m.Pull.Number).ToList();
        if (mentions.Complete)
        {
            var stale = known.FindAll(s => s.Status == "pending" && !wanted.Exists(m => m.Pull.Number == s.Number));
            db.RequirementEvidenceSuggestions.RemoveRange(stale);
            known.RemoveAll(stale.Contains);
        }
        var pending = known.Count(s => s.Status == "pending");
        foreach (var (pull, reference) in wanted)
        {
            var row = known.Find(s => s.Number == pull.Number);
            if (row is { Status: "pending" }) (row.Title, row.State, row.Author, row.Url, row.Reference) = (pull.Title, pull.State, pull.Author, pull.Url, reference);
            if (row is not null || pending >= MaxSuggestions) continue;
            pending++;
            db.RequirementEvidenceSuggestions.Add(new RequirementEvidenceSuggestion
            {
                Id = Guid.NewGuid(),
                RequirementId = requirementId,
                RepositoryId = repository.RepositoryId,
                Number = pull.Number,
                Title = pull.Title,
                State = pull.State,
                Author = pull.Author,
                Url = pull.Url,
                Reference = reference,
                FoundAt = now,
            });
        }
        return true;
    }

    private static Task<int> DropPendingAsync(SpecThreadDbContext db, Guid requirementId, long repositoryId, int number, CancellationToken cancel) =>
        db.RequirementEvidenceSuggestions
            .Where(s => s.RequirementId == requirementId && s.RepositoryId == repositoryId && s.Number == number && s.Status == "pending")
            .ExecuteDeleteAsync(cancel);

    // Records that a pull request moved away must not be suggested for this requirement again. A
    // decided row already keeps it from coming back, so that decision stays as it was made; the
    // move itself is in the history.
    private static async Task RefuseSuggestionAsync(
        SpecThreadDbContext db, Guid requirementId, RequirementEvidence evidence, int number, string userId, DateTime now, CancellationToken cancel)
    {
        var row = await db.RequirementEvidenceSuggestions
            .SingleOrDefaultAsync(s => s.RequirementId == requirementId && s.RepositoryId == evidence.RepositoryId && s.Number == number, cancel);
        if (row is null)
        {
            row = new RequirementEvidenceSuggestion
            {
                Id = Guid.NewGuid(),
                RequirementId = requirementId,
                RepositoryId = evidence.RepositoryId,
                Number = number,
                Title = evidence.Title,
                State = evidence.State!,
                Author = evidence.Author,
                Url = evidence.Url,
                Reference = "",
                FoundAt = now,
            };
            db.RequirementEvidenceSuggestions.Add(row);
        }
        if (row.Status == "pending") (row.Status, row.DecidedBy, row.DecidedAt) = ("rejected", userId, now);
    }

    private static async Task<List<EvidenceSuggestionResponse>> ReadSuggestionsAsync(
        SpecThreadDbContext db, Guid requirementId, Guid projectId, CancellationToken cancel) =>
        await db.RequirementEvidenceSuggestions.AsNoTracking()
            .Where(s => s.RequirementId == requirementId && s.Status == "pending" &&
                db.ProjectRepositories.Any(r => r.ProjectId == projectId && r.RepositoryId == s.RepositoryId))
            .OrderBy(s => s.Number)
            .Select(s => new EvidenceSuggestionResponse(s.Id, s.Number, s.Title, s.State, s.Author, s.Url, s.Reference, s.FoundAt))
            .ToListAsync(cancel);

    // What a comparison with releases depends on, in a stable order.
    private static List<(Guid Id, string? Sha, string? Change, string? Contains)> Comparable(List<RequirementEvidence> links) =>
        [.. links.Select(e => (e.Id, e.Sha, ChangeSha(e), e.Contains)).OrderBy(e => e.Id)];

    private static bool SameItem(RequirementEvidence a, RequirementEvidence b) =>
        a.RepositoryId == b.RepositoryId && a.Kind == b.Kind && a.Number == b.Number && a.Tag == b.Tag && (a.Number is not null || a.Tag is not null || a.Sha == b.Sha);

    private static ProblemHttpResult AlreadyDecided() =>
        TypedResults.Problem("Someone has already decided on this suggestion. Reload to see it.", statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult AlreadyLinkedThere(RequirementEvidence evidence) =>
        TypedResults.Problem($"{ReviewEndpoints.Label(evidence)} is already linked to that requirement.", statusCode: StatusCodes.Status409Conflict);

    private static ValidationProblem InvalidTarget(string message) =>
        TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["targetRequirementId"] = [message] });

    // GitHub's closing keywords before "#N", "owner/name#N", or an issue's address.
    [GeneratedRegex(@"\b(?<keyword>close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+(?:https://github\.com/(?<owner>[\w.-]+)/(?<name>[\w.-]+)/issues/|(?:(?<owner>[\w.-]+)/(?<name>[\w.-]+))?#)(?<number>\d{1,9})\b", RegexOptions.IgnoreCase)]
    private static partial Regex ClosingPattern();
}

internal sealed record EvidenceMention(GitHubMention Pull, string Reference);

// What a read found. Complete is false when a timeline stopped early; Issues are the linked issues it read.
internal sealed record EvidenceMentions(List<EvidenceMention> Items, bool Complete, List<int> Issues);

internal sealed record MoveEvidenceRequest(Guid? TargetRequirementId);

// Reference is what was found, such as "Closes #184".
internal sealed record EvidenceSuggestionResponse(
    Guid Id, int Number, string Title, string State, string? Author, string Url, string Reference, DateTime FoundAt);
