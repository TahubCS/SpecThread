using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.Requirements;

// A requirement can be marked as a follow-up of other requirements in its project, so a later
// change is traceable without rewriting what was accepted (ADR-052). Any project member links and
// unlinks; both are recorded with who did it and when. Links do not change either requirement's
// version, so they never make a decision outdated.
internal static class FollowUpEndpoints
{
    public const int MaxFollowUps = 20;

    public static void MapFollowUpEndpoints(this IEndpointRouteBuilder app)
    {
        var followUps = app.MapGroup("/requirements/{requirementId:guid}/follow-ups").WithTags("Requirements")
            .WithMetadata(ProjectEndpoints.Unauthorized);
        followUps.MapGet("/", List).WithName("ListFollowUps");
        followUps.MapPost("/", Add).WithName("AddFollowUp").ProducesProblem(StatusCodes.Status409Conflict);
        followUps.MapDelete("/{originalRequirementId:guid}", Remove).WithName("RemoveFollowUp").ProducesProblem(StatusCodes.Status409Conflict);
    }

    private static async Task<Results<Ok<FollowUpsResponse>, NotFound>> List(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var member = await db.Requirements.Where(r => r.Id == requirementId)
            .Join(db.ProjectsFor(user.CallerId()), r => r.ProjectId, p => p.Id, (r, p) => r.Id).AnyAsync(cancel);
        if (!member) return TypedResults.NotFound();

        var followUpOf = await db.RequirementFollowUps.AsNoTracking().Where(f => f.RequirementId == requirementId)
            .Join(db.Requirements, f => f.OriginalRequirementId, r => r.Id, (f, r) => new { Link = f, Other = r })
            .OrderBy(x => x.Other.Title).ThenBy(x => x.Other.Id)
            .Select(x => new FollowUpLink(x.Other.Id, x.Other.Title, x.Other.ArchivedAt, x.Link.LinkedBy, x.Link.LinkedAt))
            .ToListAsync(cancel);
        var followedUpBy = await db.RequirementFollowUps.AsNoTracking().Where(f => f.OriginalRequirementId == requirementId)
            .Join(db.Requirements, f => f.RequirementId, r => r.Id, (f, r) => new { Link = f, Other = r })
            .OrderBy(x => x.Other.Title).ThenBy(x => x.Other.Id)
            .Select(x => new FollowUpLink(x.Other.Id, x.Other.Title, x.Other.ArchivedAt, x.Link.LinkedBy, x.Link.LinkedAt))
            .ToListAsync(cancel);
        var history = await db.RequirementFollowUpEvents.AsNoTracking()
            .Where(e => e.RequirementId == requirementId || e.OriginalRequirementId == requirementId)
            .Join(db.Requirements, e => e.RequirementId, r => r.Id, (e, r) => new { Event = e, FollowUpTitle = r.Title })
            .Join(db.Requirements, x => x.Event.OriginalRequirementId, r => r.Id, (x, r) => new { x.Event, x.FollowUpTitle, OriginalTitle = r.Title })
            .OrderByDescending(x => x.Event.OccurredAt).ThenByDescending(x => x.Event.Id)
            .Select(x => new FollowUpEventResponse(x.Event.Id, x.Event.RequirementId, x.FollowUpTitle, x.Event.OriginalRequirementId,
                x.OriginalTitle, x.Event.Action, x.Event.Actor, x.Event.OccurredAt))
            .ToListAsync(cancel);
        return TypedResults.Ok(new FollowUpsResponse(followUpOf, followedUpBy, history));
    }

    private static async Task<Results<Created<FollowUpLink>, ValidationProblem, NotFound, ProblemHttpResult>> Add(
        Guid requirementId, FollowUpRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (request.OriginalRequirementId is not Guid originalId || originalId == Guid.Empty) return Invalid("Choose a requirement.");

        var userId = user.CallerId();
        // Serialize with archiving, membership changes, and other links in this project's team,
        // so the checks and the limit below still hold when the link is saved.
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var found = await RequirementEndpoints.LockForMember(db, userId, requirementId, cancel);
        if (found is null) return TypedResults.NotFound();
        if (found.Archived) return ProjectEndpoints.Archived();
        if (originalId == requirementId) return Invalid("A requirement can't be a follow-up of itself.");
        var original = await db.Requirements.AsNoTracking()
            .SingleOrDefaultAsync(r => r.Id == originalId && r.ProjectId == found.Requirement.ProjectId, cancel);
        if (original is null) return Invalid("Choose a requirement in this project.");
        if (original.ArchivedAt is not null)
        {
            return TypedResults.Problem("An archived requirement can't be linked as an original.", statusCode: StatusCodes.Status409Conflict);
        }
        var links = await db.RequirementFollowUps
            .Where(f => (f.RequirementId == requirementId && f.OriginalRequirementId == originalId) ||
                        (f.RequirementId == originalId && f.OriginalRequirementId == requirementId))
            .Select(f => f.RequirementId).ToListAsync(cancel);
        if (links.Contains(requirementId))
        {
            return TypedResults.Problem("This requirement is already a follow-up of that one.", statusCode: StatusCodes.Status409Conflict);
        }
        if (links.Contains(originalId)) return Invalid("That requirement is already a follow-up of this one.");
        if (await db.RequirementFollowUps.CountAsync(f => f.RequirementId == requirementId, cancel) >= MaxFollowUps)
        {
            return Invalid($"A requirement can follow up at most {MaxFollowUps} requirements.");
        }

        var now = Clock.UtcNow();
        db.RequirementFollowUps.Add(new RequirementFollowUp
        {
            RequirementId = requirementId,
            OriginalRequirementId = originalId,
            LinkedBy = userId,
            LinkedAt = now,
        });
        Record(db, requirementId, originalId, "added", userId, now);
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Created($"/requirements/{requirementId}/follow-ups",
            new FollowUpLink(original.Id, original.Title, original.ArchivedAt, userId, now));
    }

    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Remove(
        Guid requirementId, Guid originalRequirementId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var userId = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var found = await RequirementEndpoints.LockForMember(db, userId, requirementId, cancel);
        if (found is null) return TypedResults.NotFound();
        var link = await db.RequirementFollowUps
            .SingleOrDefaultAsync(f => f.RequirementId == requirementId && f.OriginalRequirementId == originalRequirementId, cancel);
        if (link is null) return TypedResults.NotFound();
        if (found.Archived) return ProjectEndpoints.Archived();

        db.RequirementFollowUps.Remove(link);
        Record(db, requirementId, originalRequirementId, "removed", userId, Clock.UtcNow());
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.NoContent();
    }

    private static void Record(SpecThreadDbContext db, Guid requirementId, Guid originalId, string action, string userId, DateTime at) =>
        db.RequirementFollowUpEvents.Add(new RequirementFollowUpEvent
        {
            Id = Guid.NewGuid(),
            RequirementId = requirementId,
            OriginalRequirementId = originalId,
            Action = action,
            Actor = userId,
            OccurredAt = at,
        });

    private static ValidationProblem Invalid(string message) =>
        TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["originalRequirementId"] = [message] });
}

internal sealed record FollowUpRequest(Guid? OriginalRequirementId);

// The other requirement of a follow-up link, with who linked them and when.
internal sealed record FollowUpLink(Guid RequirementId, string Title, DateTime? ArchivedAt, string LinkedBy, DateTime LinkedAt);

// One added or removed link. RequirementId is the follow-up; OriginalRequirementId the one it follows up.
internal sealed record FollowUpEventResponse(
    Guid Id, Guid RequirementId, string RequirementTitle, Guid OriginalRequirementId, string OriginalTitle, string Action, string Actor, DateTime OccurredAt);

internal sealed record FollowUpsResponse(List<FollowUpLink> FollowUpOf, List<FollowUpLink> FollowedUpBy, List<FollowUpEventResponse> History);
