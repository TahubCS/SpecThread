using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.Requirements;

// A requirement carries at most one milestone or sprint label, which any project member sets
// (ADR-053). Labels are free text, matched exactly; there is no separate milestone record.
internal static class MilestoneEndpoints
{
    public static void MapMilestoneEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/projects/{projectId:guid}/milestones", List).WithName("ListMilestones").WithTags("Requirements")
            .WithMetadata(ProjectEndpoints.Unauthorized);
        app.MapPut("/requirements/{requirementId:guid}/milestone", Set).WithName("SetRequirementMilestone").WithTags("Requirements")
            .WithMetadata(ProjectEndpoints.Unauthorized).ProducesProblem(StatusCodes.Status409Conflict);
    }

    // The labels in use on the project's active requirements, in order.
    private static async Task<Results<Ok<List<string>>, NotFound>> List(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (!await db.ProjectsFor(user.CallerId()).AnyAsync(p => p.Id == projectId, cancel)) return TypedResults.NotFound();
        var labels = await db.Requirements.AsNoTracking()
            .Where(r => r.ProjectId == projectId && r.ArchivedAt == null && r.Milestone != null)
            .Select(r => r.Milestone!).Distinct().ToListAsync(cancel);
        labels.Sort(StringComparer.Ordinal);
        return TypedResults.Ok(labels);
    }

    // Setting or clearing the label is not an edit: the version and last editor stay as they
    // were, so a decision on the requirement does not become outdated.
    private static async Task<Results<Ok<MilestoneResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Set(
        Guid requirementId, MilestoneRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var milestone = errors.Milestone("milestone", request.Milestone);
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var found = await RequirementEndpoints.LockForMember(db, user.CallerId(), requirementId, cancel);
        if (found is null) return TypedResults.NotFound();
        if (found.Archived) return ProjectEndpoints.Archived();
        found.Requirement.Milestone = milestone;
        try
        {
            await db.SaveChangesAsync(cancel);
        }
        catch (DbUpdateConcurrencyException)
        {
            return RequirementEndpoints.Stale();
        }
        await transaction.CommitAsync(cancel);
        return TypedResults.Ok(new MilestoneResponse(milestone));
    }
}

internal sealed record MilestoneRequest(string? Milestone);

internal sealed record MilestoneResponse(string? Milestone);
