using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.Teams;

internal static class TeamManagementEndpoints
{
    public static void MapTeamManagementEndpoints(this IEndpointRouteBuilder app)
    {
        var teams = app.MapGroup("/teams/{teamId:guid}").WithTags("Teams").WithMetadata(ProjectEndpoints.Unauthorized);
        teams.MapPatch("/", Update).WithName("UpdateTeam").ProducesProblem(StatusCodes.Status403Forbidden);
        teams.MapPatch("/members/{userId}", Role).WithName("UpdateTeamMemberRole").ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict);
        teams.MapDelete("/members/{userId}", Remove).WithName("RemoveTeamMember").ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict);
        teams.MapPost("/ownership", Transfer).WithName("TransferTeamOwnership").ProducesProblem(StatusCodes.Status403Forbidden);
    }

    // Lock the team before re-reading membership. Role changes, removals, and transfers
    // serialize on this row so a concurrent transfer cannot leave the new Owner removed.
    private static async Task<Team?> LockForCaller(SpecThreadDbContext db, Guid teamId, string userId, CancellationToken cancel)
    {
        var team = await LockTeam(db, teamId, cancel);
        return team is not null && await db.TeamMembers.AnyAsync(m => m.TeamId == teamId && m.UserId == userId, cancel) ? team : null;
    }

    internal static Task<Team?> LockTeam(SpecThreadDbContext db, Guid teamId, CancellationToken cancel) =>
        db.Teams.FromSqlInterpolated($"SELECT * FROM public.teams WHERE id = {teamId} FOR UPDATE").SingleOrDefaultAsync(cancel);

    private static async Task<Results<Ok<TeamResponse>, NotFound, ValidationProblem, ProblemHttpResult>> Update(
        Guid teamId, TeamSettingsRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var userId = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var team = await LockForCaller(db, teamId, userId, cancel);
        if (team is null) return TypedResults.NotFound();
        if (!await db.CanManageTeam(teamId, userId, cancel)) return ProjectEndpoints.ManagersOnly();
        var errors = new InputErrors();
        var name = errors.Required("name", request.Name, InputErrors.MaxNameLength);
        var description = errors.Optional("description", request.Description, InputErrors.MaxDescriptionLength);
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());
        team.Name = name!;
        team.Description = description!;
        await db.SaveChangesAsync(cancel);
        var response = await TeamEndpoints.Response(db, teamId, userId, cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Ok(response);
    }

    private static async Task<Results<Ok<TeamMemberResponse>, NotFound, ValidationProblem, ProblemHttpResult>> Role(
        Guid teamId, string userId, TeamRoleRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var callerId = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var team = await LockForCaller(db, teamId, callerId, cancel);
        if (team is null) return TypedResults.NotFound();
        if (team.OwnerUserId != callerId) return OwnerOnly();
        var target = await db.TeamMembers.SingleOrDefaultAsync(m => m.TeamId == teamId && m.UserId == userId, cancel);
        if (target is null) return TypedResults.NotFound();
        if (userId == team.OwnerUserId) return OwnerStays();
        var errors = new InputErrors();
        if (request.Role is not ("admin" or "member")) errors.Add("role", "Choose Admin or Member.");
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());
        target.Role = request.Role!;
        await db.SaveChangesAsync(cancel);
        var account = await db.Set<AuthUser>().SingleAsync(u => u.Id == userId, cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Ok(new TeamMemberResponse(userId, account.Name, account.Email, target.Role, target.JoinedAt));
    }

    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Remove(
        Guid teamId, string userId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var callerId = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var team = await LockForCaller(db, teamId, callerId, cancel);
        if (team is null) return TypedResults.NotFound();
        var target = await db.TeamMembers.SingleOrDefaultAsync(m => m.TeamId == teamId && m.UserId == userId, cancel);
        if (target is null) return TypedResults.NotFound();
        if (userId == team.OwnerUserId) return OwnerStays();
        if (userId != callerId && team.OwnerUserId != callerId)
        {
            var caller = await db.TeamMembers.SingleAsync(m => m.TeamId == teamId && m.UserId == callerId, cancel);
            if (caller.Role != "admin" || target.Role != "member")
                return TypedResults.Problem("Admins can remove regular Members; only the Owner can remove an Admin.", statusCode: StatusCodes.Status403Forbidden);
        }
        db.TeamMembers.Remove(target);
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<TeamResponse>, NotFound, ValidationProblem, ProblemHttpResult>> Transfer(
        Guid teamId, TeamOwnershipRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var callerId = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var team = await LockForCaller(db, teamId, callerId, cancel);
        if (team is null) return TypedResults.NotFound();
        if (team.OwnerUserId != callerId) return OwnerOnly();
        var errors = new InputErrors();
        var targetId = errors.Required("userId", request.UserId, 200);
        if (targetId == callerId) errors.Add("userId", "Choose another team member.");
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());
        var target = await db.TeamMembers.SingleOrDefaultAsync(m => m.TeamId == teamId && m.UserId == targetId, cancel);
        if (target is null) return TypedResults.NotFound();
        var previous = await db.TeamMembers.SingleAsync(m => m.TeamId == teamId && m.UserId == callerId, cancel);
        team.OwnerUserId = target.UserId;
        target.Role = "member"; // Owner is derived exclusively from the team's owner ID.
        previous.Role = "admin";
        await db.SaveChangesAsync(cancel);
        var response = await TeamEndpoints.Response(db, teamId, callerId, cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Ok(response);
    }

    private static ProblemHttpResult OwnerOnly() => TypedResults.Problem("Only the team Owner can do this.", statusCode: StatusCodes.Status403Forbidden);
    private static ProblemHttpResult OwnerStays() => TypedResults.Problem("The Owner must transfer ownership before leaving or changing their role.", statusCode: StatusCodes.Status409Conflict);
}

internal sealed record TeamSettingsRequest(string? Name, string? Description);
internal sealed record TeamRoleRequest(string? Role);
internal sealed record TeamOwnershipRequest(string? UserId);
