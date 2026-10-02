using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SpecThread.Api.Data;

namespace SpecThread.Api.Projects;

// The owner adds existing accounts by email and removes members; any member may leave (ADR-025).
internal static class MemberEndpoints
{
    public static void MapMemberEndpoints(this IEndpointRouteBuilder app)
    {
        var members = app.MapGroup("/projects/{projectId:guid}/members").WithTags("Project members")
            .WithMetadata(ProjectEndpoints.Unauthorized);

        members.MapGet("/", List).WithName("ListProjectMembers");
        members.MapPost("/", Add).WithName("AddProjectMember")
            .ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict);
        members.MapDelete("/{userId}", Remove).WithName("RemoveProjectMember")
            .ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict);
    }

    private static async Task<Results<Ok<List<MemberResponse>>, NotFound>> List(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var project = await db.ProjectsFor(user.CallerId()).AsNoTracking().SingleOrDefaultAsync(p => p.Id == projectId, cancel);
        if (project is null) return TypedResults.NotFound();

        var members = await MembersOf(db, project).ToListAsync(cancel);
        return TypedResults.Ok(members.OrderByDescending(m => m.IsOwner).ThenBy(m => m.Name).ThenBy(m => m.UserId).ToList());
    }

    private static async Task<Results<Created<MemberResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Add(
        Guid projectId, AddMemberRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var email = errors.Required("email", request.Email, InputErrors.MaxEmailLength)?.ToLowerInvariant();
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var callerId = user.CallerId();
        var project = await db.ProjectsFor(callerId).AsNoTracking().SingleOrDefaultAsync(p => p.Id == projectId, cancel);
        if (project is null) return TypedResults.NotFound();
        if (project.OwnerUserId != callerId) return ProjectEndpoints.OwnerOnly();
        if (project.ArchivedAt is not null) return ProjectEndpoints.Archived();

        // Only verified addresses count, so an unverified sign-up with someone else's email gains nothing.
        var account = await db.Set<AuthUser>().AsNoTracking()
            .Where(u => u.EmailVerified && u.Email.ToLower() == email)
            .SingleOrDefaultAsync(cancel);
        if (account is null)
        {
            errors.Add("email", "No SpecThread account uses this email.");
            return TypedResults.ValidationProblem(errors.ToDictionary());
        }

        var member = new ProjectMember { ProjectId = projectId, UserId = account.Id, JoinedAt = Clock.UtcNow() };
        db.ProjectMembers.Add(member);
        try
        {
            await db.SaveChangesAsync(cancel);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            return TypedResults.Problem("This person is already a member.", statusCode: StatusCodes.Status409Conflict);
        }

        return TypedResults.Created($"/projects/{projectId}/members/{account.Id}",
            new MemberResponse(account.Id, account.Name, account.Email, member.JoinedAt, account.Id == project.OwnerUserId));
    }

    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Remove(
        Guid projectId, string userId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var callerId = user.CallerId();
        var project = await db.ProjectsFor(callerId).AsNoTracking().SingleOrDefaultAsync(p => p.Id == projectId, cancel);
        if (project is null) return TypedResults.NotFound();
        if (project.OwnerUserId != callerId && userId != callerId) return ProjectEndpoints.OwnerOnly();

        var member = await db.ProjectMembers.SingleOrDefaultAsync(m => m.ProjectId == projectId && m.UserId == userId, cancel);
        if (member is null) return TypedResults.NotFound();
        if (userId == project.OwnerUserId)
        {
            return TypedResults.Problem("The project owner can't be removed.", statusCode: StatusCodes.Status409Conflict);
        }
        if (project.ArchivedAt is not null) return ProjectEndpoints.Archived();

        db.ProjectMembers.Remove(member);
        await db.SaveChangesAsync(cancel);
        return TypedResults.NoContent();
    }

    private static IQueryable<MemberResponse> MembersOf(SpecThreadDbContext db, Project project) =>
        db.ProjectMembers.Where(m => m.ProjectId == project.Id)
            .Join(db.Set<AuthUser>(), m => m.UserId, u => u.Id,
                (m, u) => new MemberResponse(u.Id, u.Name, u.Email, m.JoinedAt, u.Id == project.OwnerUserId));
}

internal sealed record AddMemberRequest(string? Email);

internal sealed record MemberResponse(string UserId, string Name, string Email, DateTime JoinedAt, bool IsOwner);
