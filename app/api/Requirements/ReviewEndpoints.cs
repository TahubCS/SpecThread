using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.Requirements;

// Records a person's decision on a requirement: accepted, rejected, or more evidence requested
// (ADR-038). Any project member reads the decisions. Any member except the requirement's author
// records one. Decisions are only ever added, so the history stays as it was made.
internal static class ReviewEndpoints
{
    public const int MaxNoteLength = 2_000;
    private static readonly string[] Decisions = ["accepted", "rejected", "more_evidence"];
    private static readonly JsonSerializerOptions SnapshotJson = new(JsonSerializerDefaults.Web);

    public static void MapReviewEndpoints(this IEndpointRouteBuilder app)
    {
        var reviews = app.MapGroup("/requirements/{requirementId:guid}/reviews").WithTags("Reviews")
            .WithMetadata(ProjectEndpoints.Unauthorized);
        reviews.MapGet("/", List).WithName("ListReviews");
        reviews.MapPost("/", Record).WithName("RecordReview")
            .ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict);
    }

    private static async Task<Results<Ok<List<ReviewResponse>>, NotFound>> List(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (!await IsMemberAsync(db, user.CallerId(), requirementId, cancel)) return TypedResults.NotFound();
        var reviews = await db.RequirementReviews.AsNoTracking().Where(r => r.RequirementId == requirementId)
            .OrderByDescending(r => r.DecidedAt).ThenByDescending(r => r.Id).ToListAsync(cancel);
        return TypedResults.Ok(reviews.ConvertAll(ToResponse));
    }

    private static async Task<Results<Created<ReviewResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Record(
        Guid requirementId, RecordReviewRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var decision = request.Decision?.Trim();
        if (decision is null || !Decisions.Contains(decision)) errors.Add("decision", "Choose accept, reject, or request more evidence.");
        var note = errors.Optional("note", request.Note, MaxNoteLength);
        if (note is { Length: 0 } && decision is "rejected" or "more_evidence") errors.Add("note", "Say what is missing or wrong, so the team knows what to do next.");
        if (request.Version is not > 0) errors.Add("version", "Send the version you reviewed.");
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var userId = user.CallerId();
        // Serialize with edits, archiving, and membership changes in this project's team, so the
        // decision is checked against what is there when it is saved.
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var found = await RequirementEndpoints.LockForMember(db, userId, requirementId, cancel);
        if (found is null) return TypedResults.NotFound();
        if (found.Archived) return ProjectEndpoints.Archived();
        var requirement = found.Requirement;
        // A second person has to look: nobody decides on a requirement they wrote.
        if (requirement.CreatedBy == userId)
        {
            return TypedResults.Problem("You created this requirement, so another project member has to review it.", statusCode: StatusCodes.Status403Forbidden);
        }
        // Nobody decides on text they have not seen.
        if (requirement.Version != request.Version)
        {
            return TypedResults.Problem("This requirement changed since it was loaded. Reload it and review the current version.", statusCode: StatusCodes.Status409Conflict);
        }

        // What was linked at this moment is kept with the decision, so it stays answerable what was reviewed.
        var evidence = await db.RequirementEvidence.AsNoTracking().Where(e => e.RequirementId == requirementId)
            .OrderBy(e => e.GitHubCreatedAt).ThenBy(e => e.Number).ThenBy(e => e.Tag).ThenBy(e => e.Sha).ToListAsync(cancel);
        var review = new RequirementReview
        {
            Id = Guid.NewGuid(),
            RequirementId = requirementId,
            Decision = decision!,
            Note = note!,
            RequirementVersion = requirement.Version,
            CriteriaVersion = (await CriteriaVersionEndpoints.EnsureCurrentAsync(db, requirement, cancel)).Number,
            Evidence = JsonSerializer.Serialize(evidence.ConvertAll(e => new ReviewedEvidence(e.Id, e.Kind, Label(e), e.Title, e.State)), SnapshotJson),
            DecidedBy = userId,
            DecidedAt = Clock.UtcNow(),
        };
        db.RequirementReviews.Add(review);
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Created($"/requirements/{requirementId}/reviews/{review.Id}", ToResponse(review));
    }

    // A decision is outdated when the requirement was edited since, or its evidence links are no
    // longer the ones reviewed. Reading the same links again from GitHub does not make it outdated.
    public static bool IsOutdated(RequirementReview review, int currentVersion, IEnumerable<Guid> currentEvidence) =>
        review.RequirementVersion != currentVersion || !ReadSnapshot(review).Select(e => e.Id).ToHashSet().SetEquals(currentEvidence);

    // The latest decision as lists show it. `CriteriaChanged` says the criteria have been changed
    // since the decision, so it applies to an earlier criteria version and needs a new review (ADR-051).
    public static ReviewSummary Summarize(RequirementReview review, int currentVersion, IEnumerable<Guid> currentEvidence, int? currentCriteriaVersion) =>
        new(review.Decision, review.DecidedBy, review.DecidedAt, IsOutdated(review, currentVersion, currentEvidence),
            review.CriteriaVersion is { } reviewed && currentCriteriaVersion is { } current && reviewed != current, review.CriteriaVersion);

    private static List<ReviewedEvidence> ReadSnapshot(RequirementReview review) =>
        JsonSerializer.Deserialize<List<ReviewedEvidence>>(review.Evidence, SnapshotJson) ?? [];

    private static string Label(RequirementEvidence evidence) => evidence switch
    {
        { Number: { } number } => $"#{number}",
        { Tag: { } tag } => tag,
        _ => evidence.Sha is { Length: >= 7 } sha ? sha[..7] : "",
    };

    // False when the requirement does not exist or the caller is not a member of its project.
    private static Task<bool> IsMemberAsync(SpecThreadDbContext db, string userId, Guid requirementId, CancellationToken cancel) =>
        db.Requirements.Where(r => r.Id == requirementId)
            .Join(db.ProjectsFor(userId), r => r.ProjectId, p => p.Id, (r, p) => r.Id)
            .AnyAsync(cancel);

    private static ReviewResponse ToResponse(RequirementReview r) =>
        new(r.Id, r.RequirementId, r.Decision, r.Note, r.RequirementVersion, ReadSnapshot(r), r.DecidedBy, r.DecidedAt, r.CriteriaVersion);
}

internal sealed record RecordReviewRequest(string? Decision, string? Note, int? Version);

// One evidence link as it was when a decision was made.
internal sealed record ReviewedEvidence(Guid Id, string Kind, string Label, string Title, string? State);

internal sealed record ReviewResponse(
    Guid Id, Guid RequirementId, string Decision, string Note, int RequirementVersion, List<ReviewedEvidence> Evidence, string DecidedBy, DateTime DecidedAt,
    int? CriteriaVersion);

// The latest decision on a requirement, as shown on lists.
internal sealed record ReviewSummary(string Decision, string DecidedBy, DateTime DecidedAt, bool Outdated, bool CriteriaChanged, int? CriteriaVersion);
