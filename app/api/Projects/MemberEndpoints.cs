using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;

namespace SpecThread.Api.Projects;

// Projects inherit their team's membership. Individual membership writes are retired.
internal static class MemberEndpoints
{
    public static void MapMemberEndpoints(this IEndpointRouteBuilder app)
    {
        var members = app.MapGroup("/projects/{projectId:guid}/members").WithTags("Project members").WithMetadata(ProjectEndpoints.Unauthorized);
        members.MapGet("/", List).WithName("ListProjectMembers");
        members.MapPost("/", Retired).WithName("AddProjectMember").ProducesProblem(StatusCodes.Status410Gone);
        members.MapDelete("/{userId}", Retired).WithName("RemoveProjectMember").ProducesProblem(StatusCodes.Status410Gone);
    }

    private static async Task<Results<Ok<List<MemberResponse>>, NotFound>> List(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var project = await db.ProjectsFor(user.CallerId()).AsNoTracking().SingleOrDefaultAsync(p => p.Id == projectId, cancel);
        if (project is null) return TypedResults.NotFound();
        var ownerId = await db.Teams.Where(t => t.Id == project.TeamId).Select(t => t.OwnerUserId).SingleAsync(cancel);
        var members = await db.TeamMembers.Where(m => m.TeamId == project.TeamId)
            .Join(db.Set<AuthUser>(), m => m.UserId, u => u.Id,
                (m, u) => new MemberResponse(u.Id, u.Name, u.Email, m.JoinedAt, u.Id == ownerId, u.Id == ownerId ? "owner" : m.Role)).ToListAsync(cancel);
        return TypedResults.Ok(members.OrderByDescending(m => m.IsOwner).ThenBy(m => m.Name).ThenBy(m => m.UserId).ToList());
    }

    private static async Task<Results<NotFound, ProblemHttpResult>> Retired(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (!await db.ProjectsFor(user.CallerId()).AnyAsync(p => p.Id == projectId, cancel)) return TypedResults.NotFound();
        return TypedResults.Problem("Project access is managed through team membership and invitations.", statusCode: StatusCodes.Status410Gone,
            extensions: new Dictionary<string, object?> { ["code"] = "team_membership_required" });
    }
}

internal sealed record MemberResponse(string UserId, string Name, string Email, DateTime JoinedAt, bool IsOwner, string Role);
