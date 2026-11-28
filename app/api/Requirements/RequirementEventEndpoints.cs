using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.Requirements;

// The audit record of requirements (ADR-065). Every change to a requirement itself is recorded
// with who made it and when, next to the existing records of evidence links (ADR-054), decisions
// (ADR-038), follow-ups (ADR-052), and comments (ADR-059). Nothing here edits or deletes a
// record: the API only adds them, and members only read them.
internal static class RequirementEventEndpoints
{
    public const int MaxAuditEntries = 200;

    public static void MapRequirementEventEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/requirements/{requirementId:guid}/events", List).WithName("ListRequirementEvents").WithTags("Requirements")
            .WithMetadata(ProjectEndpoints.Unauthorized);
        app.MapGet("/projects/{projectId:guid}/audit", Audit).WithName("ListProjectAudit").WithTags("Projects")
            .WithMetadata(ProjectEndpoints.Unauthorized);
    }

    // Adds one record to the change being saved; the caller's SaveChanges writes it with that change.
    public static void Record(
        SpecThreadDbContext db, Guid requirementId, string action, string actor, DateTime at,
        int? version = null, string[]? changes = null, string? milestone = null) =>
        db.RequirementEvents.Add(new RequirementEvent
        {
            Id = Guid.NewGuid(),
            RequirementId = requirementId,
            Action = action,
            Version = version,
            Changes = changes,
            Milestone = milestone,
            Actor = actor,
            OccurredAt = at,
        });

    // Every change to one requirement, newest first. Any member of its project reads them.
    private static async Task<Results<Ok<List<RequirementEventResponse>>, NotFound>> List(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var member = await db.Requirements.Where(r => r.Id == requirementId)
            .Join(db.ProjectsFor(user.CallerId()), r => r.ProjectId, p => p.Id, (r, p) => r.Id).AnyAsync(cancel);
        if (!member) return TypedResults.NotFound();
        var events = await db.RequirementEvents.AsNoTracking().Where(e => e.RequirementId == requirementId)
            .OrderByDescending(e => e.OccurredAt).ThenByDescending(e => e.Id)
            .Select(e => new RequirementEventResponse(e.Id, e.RequirementId, e.Action, e.Version, e.Changes, e.Milestone, e.Actor, e.OccurredAt))
            .ToListAsync(cancel);
        return TypedResults.Ok(events);
    }

    // The newest changes across a project's requirements, newest first: requirement changes,
    // evidence link changes, decisions, follow-up links, and comment activity, at most
    // MaxAuditEntries in all. Comment text is not included, only that a comment changed.
    private static async Task<Results<Ok<List<AuditEntryResponse>>, NotFound>> Audit(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (!await db.ProjectsFor(user.CallerId()).AnyAsync(p => p.Id == projectId, cancel)) return TypedResults.NotFound();
        var requirements = db.Requirements.AsNoTracking().Where(r => r.ProjectId == projectId);
        const int take = MaxAuditEntries;

        var changes = await db.RequirementEvents.AsNoTracking()
            .Join(requirements, e => e.RequirementId, r => r.Id, (e, r) => new { e, r.Title })
            .OrderByDescending(x => x.e.OccurredAt).ThenByDescending(x => x.e.Id).Take(take)
            .Select(x => new AuditEntryResponse(x.e.Id, x.e.RequirementId, x.Title, "requirement", x.e.Action, x.e.Actor, x.e.OccurredAt,
                x.e.Version, x.e.Changes, x.e.Milestone, null, null, null))
            .ToListAsync(cancel);
        var links = await db.RequirementEvidenceEvents.AsNoTracking()
            .Join(requirements, e => e.RequirementId, r => r.Id, (e, r) => new { e, r.Title })
            .OrderByDescending(x => x.e.OccurredAt).ThenByDescending(x => x.e.Id).Take(take)
            .Select(x => new AuditEntryResponse(x.e.Id, x.e.RequirementId, x.Title, "evidence", x.e.Action, x.e.Actor, x.e.OccurredAt,
                null, null, null, x.e.Label, x.e.Title,
                db.Requirements.Where(o => o.Id == x.e.OtherRequirementId).Select(o => o.Title).FirstOrDefault()))
            .ToListAsync(cancel);
        var decisions = await db.RequirementReviews.AsNoTracking()
            .Join(requirements, v => v.RequirementId, r => r.Id, (v, r) => new { v, r.Title })
            .OrderByDescending(x => x.v.DecidedAt).ThenByDescending(x => x.v.Id).Take(take)
            .Select(x => new AuditEntryResponse(x.v.Id, x.v.RequirementId, x.Title, "decision", x.v.Decision, x.v.DecidedBy, x.v.DecidedAt,
                x.v.RequirementVersion, null, null, null, null, null))
            .ToListAsync(cancel);
        var followUps = await db.RequirementFollowUpEvents.AsNoTracking()
            .Join(requirements, e => e.RequirementId, r => r.Id, (e, r) => new { e, r.Title })
            .OrderByDescending(x => x.e.OccurredAt).ThenByDescending(x => x.e.Id).Take(take)
            .Select(x => new AuditEntryResponse(x.e.Id, x.e.RequirementId, x.Title, "follow_up", x.e.Action, x.e.Actor, x.e.OccurredAt,
                null, null, null, null, null,
                db.Requirements.Where(o => o.Id == x.e.OriginalRequirementId).Select(o => o.Title).FirstOrDefault()))
            .ToListAsync(cancel);
        var comments = await db.RequirementCommentEvents.AsNoTracking()
            .Join(requirements, e => e.RequirementId, r => r.Id, (e, r) => new { e, r.Title })
            .OrderByDescending(x => x.e.OccurredAt).ThenByDescending(x => x.e.Id).Take(take)
            .Select(x => new AuditEntryResponse(x.e.Id, x.e.RequirementId, x.Title, "comment", x.e.Action, x.e.Actor, x.e.OccurredAt,
                null, null, null, null, null, null))
            .ToListAsync(cancel);

        var entries = changes.Concat(links).Concat(decisions).Concat(followUps).Concat(comments)
            .OrderByDescending(e => e.OccurredAt).ThenByDescending(e => e.Id)
            .Take(take)
            .ToList();
        return TypedResults.Ok(entries);
    }
}

internal sealed record RequirementEventResponse(
    Guid Id, Guid RequirementId, string Action, int? Version, string[]? Changes, string? Milestone, string Actor, DateTime OccurredAt);

// One entry in a project's audit trail. Area says which record it comes from: "requirement"
// (Action as in RequirementEvent, with Version, Changes, and Milestone), "evidence" (Action as in
// ADR-054 and ADR-056, with the link's Label and Title, and the requirement on the other side of a
// move), "decision" (Action is the decision; Version is the requirement version decided on),
// "follow_up" (Action "added" or "removed"; OtherRequirementTitle is the original requirement), or
// "comment" (Action "created", "edited", or "deleted").
internal sealed record AuditEntryResponse(
    Guid Id, Guid RequirementId, string RequirementTitle, string Area, string Action, string Actor, DateTime OccurredAt,
    int? Version, string[]? Changes, string? Milestone, string? Label, string? Title, string? OtherRequirementTitle);
