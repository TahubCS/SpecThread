using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.Teams;

// Only team members can discover a team. Ownership is a single authoritative user ID.
internal static class TeamEndpoints
{
    public static void MapTeamEndpoints(this IEndpointRouteBuilder app)
    {
        var teams = app.MapGroup("/teams").WithTags("Teams")
            .WithMetadata(ProjectEndpoints.Unauthorized);
        teams.MapGet("/", List).WithName("ListTeams");
        teams.MapPost("/", Create).WithName("CreateTeam")
            .ProducesProblem(StatusCodes.Status403Forbidden);
        teams.MapGet("/{teamId:guid}", Get).WithName("GetTeam");
        teams.MapGet("/{teamId:guid}/members", Members).WithName("ListTeamMembers");
        teams.MapPatch("/{teamId:guid}/preferences", Preferences).WithName("UpdateTeamPreferences");

        app.MapGet("/onboarding", Onboarding).WithTags("Onboarding").WithName("GetOnboarding")
            .WithMetadata(ProjectEndpoints.Unauthorized).ProducesProblem(StatusCodes.Status403Forbidden);
        app.MapPost("/onboarding", FinishOnboarding).WithTags("Onboarding").WithName("FinishOnboarding")
            .WithMetadata(ProjectEndpoints.Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict);
    }

    private static async Task<Ok<List<TeamResponse>>> List(
        ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel) =>
        TypedResults.Ok(await Responses(ForCaller(db, user.CallerId())
            .OrderBy(t => t.Name).ThenBy(t => t.Id), db, user.CallerId()).ToListAsync(cancel));

    private static async Task<Results<Ok<TeamResponse>, NotFound>> Get(
        Guid teamId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var team = await Responses(ForCaller(db, user.CallerId()).Where(t => t.Id == teamId), db, user.CallerId())
            .SingleOrDefaultAsync(cancel);
        return team is null ? TypedResults.NotFound() : TypedResults.Ok(team);
    }

    private static async Task<Results<Created<TeamResponse>, ValidationProblem, ProblemHttpResult>> Create(
        CreateTeamRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel) =>
        await CreateCore(request, user, db, false, cancel);

    private static async Task<Results<Created<TeamResponse>, ValidationProblem, ProblemHttpResult>> FinishOnboarding(
        CreateTeamRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel) =>
        await CreateCore(request, user, db, true, cancel);

    private static async Task<Results<Created<TeamResponse>, ValidationProblem, ProblemHttpResult>> CreateCore(
        CreateTeamRequest request, ClaimsPrincipal user, SpecThreadDbContext db, bool initial, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var name = errors.Required("name", request.Name, InputErrors.MaxNameLength);
        var description = errors.Optional("description", request.Description, InputErrors.MaxDescriptionLength);
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var userId = user.CallerId();
        if (!await db.Set<AuthUser>().AnyAsync(u => u.Id == userId, cancel))
        {
            return TypedResults.Problem("The signed-in user has no account record.", statusCode: StatusCodes.Status403Forbidden);
        }

        var completed = await db.UserOnboardings.AnyAsync(o => o.UserId == userId, cancel);
        if (initial && completed)
            return TypedResults.Problem("Initial team setup is already complete.", statusCode: StatusCodes.Status409Conflict);

        var team = new Team
        {
            Id = Guid.NewGuid(),
            Name = name!,
            Description = description!,
            OwnerUserId = userId,
            CreatedAt = Clock.UtcNow(),
        };
        db.Teams.Add(team);
        db.TeamMembers.Add(new TeamMember { TeamId = team.Id, UserId = userId, JoinedAt = team.CreatedAt });
        if (!completed) db.UserOnboardings.Add(new UserOnboarding { UserId = userId, CompletedAt = team.CreatedAt });
        try
        {
            await db.SaveChangesAsync(cancel); // Team, owner membership, and completion commit together.
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // A simultaneous first-team request won. This request's transaction created nothing.
            return TypedResults.Problem("Initial team setup was completed by another request.", statusCode: StatusCodes.Status409Conflict);
        }

        return TypedResults.Created($"/teams/{team.Id}",
            new TeamResponse(team.Id, team.Name, team.Description, userId, team.CreatedAt, "owner", 1, false, true));
    }

    private static async Task<Results<Ok<OnboardingResponse>, ProblemHttpResult>> Onboarding(
        ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var userId = user.CallerId();
        if (!await db.Set<AuthUser>().AnyAsync(u => u.Id == userId, cancel))
            return TypedResults.Problem("The signed-in user has no account record.", statusCode: StatusCodes.Status403Forbidden);
        return TypedResults.Ok(new OnboardingResponse(await db.UserOnboardings.AnyAsync(o => o.UserId == userId, cancel)));
    }

    private static async Task<Results<Ok<List<TeamMemberResponse>>, NotFound>> Members(
        Guid teamId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var team = await ForCaller(db, user.CallerId()).SingleOrDefaultAsync(t => t.Id == teamId, cancel);
        if (team is null) return TypedResults.NotFound();
        var members = await db.TeamMembers.Where(m => m.TeamId == teamId)
            .Join(db.Set<AuthUser>(), m => m.UserId, u => u.Id,
                (m, u) => new TeamMemberResponse(u.Id, u.Name, u.Email,
                    u.Id == team.OwnerUserId ? "owner" : m.Role, m.JoinedAt)).ToListAsync(cancel);
        return TypedResults.Ok(members.OrderByDescending(m => m.Role == "owner")
            .ThenBy(m => m.Name).ThenBy(m => m.UserId).ToList());
    }

    private static async Task<Results<Ok<TeamResponse>, NotFound>> Preferences(
        Guid teamId, TeamPreferencesRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var userId = user.CallerId();
        var membership = await db.TeamMembers.SingleOrDefaultAsync(m => m.TeamId == teamId && m.UserId == userId, cancel);
        if (membership is null) return TypedResults.NotFound();
        if (request.IsFavorite is bool favorite) membership.IsFavorite = favorite;
        if (request.IsExpanded is bool expanded) membership.IsExpanded = expanded;
        await db.SaveChangesAsync(cancel);
        return TypedResults.Ok(await Responses(ForCaller(db, userId).Where(t => t.Id == teamId), db, userId).SingleAsync(cancel));
    }

    internal static IQueryable<Team> ForCaller(SpecThreadDbContext db, string userId) =>
        db.Teams.AsNoTracking().Where(t => db.TeamMembers.Any(m => m.TeamId == t.Id && m.UserId == userId));

    internal static Task<TeamResponse> Response(SpecThreadDbContext db, Guid teamId, string userId, CancellationToken cancel) =>
        Responses(ForCaller(db, userId).Where(t => t.Id == teamId), db, userId).SingleAsync(cancel);

    // Filter and order entities before constructing the response record so EF translates the query.
    private static IQueryable<TeamResponse> Responses(IQueryable<Team> teams, SpecThreadDbContext db, string userId) =>
        teams.Select(t => new TeamResponse(t.Id, t.Name, t.Description, t.OwnerUserId, t.CreatedAt,
            t.OwnerUserId == userId ? "owner" : db.TeamMembers.Where(m => m.TeamId == t.Id && m.UserId == userId).Select(m => m.Role).First(),
            db.TeamMembers.Count(m => m.TeamId == t.Id),
            db.TeamMembers.Where(m => m.TeamId == t.Id && m.UserId == userId).Select(m => m.IsFavorite).First(),
            db.TeamMembers.Where(m => m.TeamId == t.Id && m.UserId == userId).Select(m => m.IsExpanded).First()));
}

internal sealed record CreateTeamRequest(string? Name, string? Description);

internal sealed record TeamResponse(
    Guid Id, string Name, string Description, string OwnerUserId, DateTime CreatedAt, string Role, int MemberCount,
    bool IsFavorite, bool IsExpanded);

internal sealed record TeamPreferencesRequest(bool? IsFavorite, bool? IsExpanded);
internal sealed record TeamMemberResponse(string UserId, string Name, string Email, string Role, DateTime JoinedAt);
internal sealed record OnboardingResponse(bool Completed);
