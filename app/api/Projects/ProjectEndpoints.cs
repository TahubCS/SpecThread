using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Teams;

namespace SpecThread.Api.Projects;

// Access and management follow the containing team's membership and roles (ADR-040).
internal static class ProjectEndpoints
{
    internal static readonly ProducesResponseTypeMetadata Unauthorized = new(StatusCodes.Status401Unauthorized, typeof(void));

    public static void MapProjectEndpoints(this IEndpointRouteBuilder app)
    {
        var projects = app.MapGroup("/projects").WithTags("Projects").WithMetadata(Unauthorized);
        projects.MapGet("/", List).WithName("ListProjects");
        projects.MapPost("/", Create).WithName("CreateProject")
            .ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict).Produces(StatusCodes.Status404NotFound);
        projects.MapGet("/{projectId:guid}", Get).WithName("GetProject");
        projects.MapPatch("/{projectId:guid}", Rename).WithName("RenameProject")
            .ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict);
        projects.MapPost("/{projectId:guid}/archive", Archive).WithName("ArchiveProject").ProducesProblem(StatusCodes.Status403Forbidden);
        projects.MapPost("/{projectId:guid}/restore", Restore).WithName("RestoreProject").ProducesProblem(StatusCodes.Status403Forbidden);
        app.MapGet("/teams/{teamId:guid}/projects", TeamProjects).WithTags("Teams").WithName("ListTeamProjects").WithMetadata(Unauthorized);
    }

    private static async Task<Ok<List<ProjectResponse>>> List(ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel) =>
        TypedResults.Ok(await Responses(db.ProjectsFor(user.CallerId()).Where(p => p.ArchivedAt == null)
            .OrderBy(p => p.Name).ThenBy(p => p.Id), db, user.CallerId()).ToListAsync(cancel));

    private static async Task<Results<Ok<List<ProjectResponse>>, NotFound>> TeamProjects(
        Guid teamId, bool? archived, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var userId = user.CallerId();
        if (!await TeamEndpoints.ForCaller(db, userId).AnyAsync(t => t.Id == teamId, cancel)) return TypedResults.NotFound();
        var projects = db.ProjectsFor(userId).Where(p => p.TeamId == teamId &&
            (archived == true ? p.ArchivedAt != null : p.ArchivedAt == null)).OrderBy(p => p.Name).ThenBy(p => p.Id);
        return TypedResults.Ok(await Responses(projects, db, userId).ToListAsync(cancel));
    }

    private static async Task<Results<Created<ProjectResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Create(
        CreateProjectRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var name = errors.Required("name", request.Name, InputErrors.MaxNameLength);
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());
        var userId = user.CallerId();
        if (!await db.Set<AuthUser>().AnyAsync(u => u.Id == userId, cancel))
            return TypedResults.Problem("The signed-in user has no account record.", statusCode: StatusCodes.Status403Forbidden);
        if (!await db.UserOnboardings.AnyAsync(o => o.UserId == userId, cancel))
            return TypedResults.Problem("Name your first team before creating projects.", statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = "onboarding_required" });
        if (request.TeamId is not Guid teamId || teamId == Guid.Empty)
        {
            errors.Add("teamId", "Choose a team.");
            return TypedResults.ValidationProblem(errors.ToDictionary());
        }
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        if (await TeamManagementEndpoints.LockTeam(db, teamId, cancel) is null ||
            !await TeamEndpoints.ForCaller(db, userId).AnyAsync(t => t.Id == teamId, cancel)) return TypedResults.NotFound();
        if (!await db.CanManageTeam(teamId, userId, cancel)) return ManagersOnly();
        var project = new Project { Id = Guid.NewGuid(), Name = name!, TeamId = teamId, OwnerUserId = userId, CreatedAt = Clock.UtcNow() };
        db.Projects.Add(project);
        await db.SaveChangesAsync(cancel);
        var response = await Response(db, project.Id, userId, cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Created($"/projects/{project.Id}", response);
    }

    private static async Task<Results<Ok<ProjectResponse>, NotFound>> Get(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var project = await Responses(db.ProjectsFor(user.CallerId()).Where(p => p.Id == projectId), db, user.CallerId()).SingleOrDefaultAsync(cancel);
        return project is null ? TypedResults.NotFound() : TypedResults.Ok(project);
    }

    private static async Task<Results<Ok<ProjectResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Rename(
        Guid projectId, ProjectRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var name = errors.Required("name", request.Name, InputErrors.MaxNameLength);
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());
        var userId = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var project = await LockProjectForCaller(db, projectId, userId, cancel);
        if (project is null) return TypedResults.NotFound();
        if (!await db.CanManageTeam(project.TeamId, userId, cancel)) return ManagersOnly();
        if (project.ArchivedAt is not null) return Archived();
        project.Name = name!;
        await db.SaveChangesAsync(cancel);
        var response = await Response(db, projectId, userId, cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Ok(response);
    }

    private static Task<Results<Ok<ProjectResponse>, NotFound, ProblemHttpResult>> Archive(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel) => SetArchived(projectId, true, user, db, cancel);

    private static Task<Results<Ok<ProjectResponse>, NotFound, ProblemHttpResult>> Restore(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel) => SetArchived(projectId, false, user, db, cancel);

    private static async Task<Results<Ok<ProjectResponse>, NotFound, ProblemHttpResult>> SetArchived(
        Guid projectId, bool archived, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var userId = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var project = await LockProjectForCaller(db, projectId, userId, cancel);
        if (project is null) return TypedResults.NotFound();
        if (!await db.CanManageTeam(project.TeamId, userId, cancel)) return ManagersOnly();
        project.ArchivedAt = archived ? project.ArchivedAt ?? Clock.UtcNow() : null;
        await db.SaveChangesAsync(cancel);
        var response = await Response(db, projectId, userId, cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Ok(response);
    }

    private static async Task<Project?> LockProjectForCaller(SpecThreadDbContext db, Guid projectId, string userId, CancellationToken cancel)
    {
        var teamId = await db.ProjectsFor(userId).Where(p => p.Id == projectId).Select(p => (Guid?)p.TeamId).SingleOrDefaultAsync(cancel);
        if (teamId is null || await TeamManagementEndpoints.LockTeam(db, teamId.Value, cancel) is null) return null;
        // Re-read both project state and membership after locking: removal, demotion,
        // transfer, and other project-management writes all serialize on this team.
        return await db.ProjectsFor(userId).SingleOrDefaultAsync(p => p.Id == projectId, cancel);
    }

    internal static ProblemHttpResult Archived() => TypedResults.Problem("Archived items cannot be changed.", statusCode: StatusCodes.Status409Conflict);
    internal static ProblemHttpResult ManagersOnly() => TypedResults.Problem("Only the team Owner or an Admin can do this.", statusCode: StatusCodes.Status403Forbidden);

    private static Task<ProjectResponse> Response(SpecThreadDbContext db, Guid projectId, string userId, CancellationToken cancel) =>
        Responses(db.ProjectsFor(userId).Where(p => p.Id == projectId), db, userId).SingleAsync(cancel);

    private static IQueryable<ProjectResponse> Responses(IQueryable<Project> projects, SpecThreadDbContext db, string userId) =>
        projects.Select(p => new ProjectResponse(p.Id, p.Name, p.OwnerUserId, p.CreatedAt, p.ArchivedAt, p.TeamId,
            db.Teams.Where(t => t.Id == p.TeamId).Select(t => t.Name).First(),
            db.Teams.Any(t => t.Id == p.TeamId && t.OwnerUserId == userId) ? "owner" :
                db.TeamMembers.Where(m => m.TeamId == p.TeamId && m.UserId == userId).Select(m => m.Role).First(),
            db.Requirements.Count(r => r.ProjectId == p.Id && r.ArchivedAt == null)));
}

internal sealed record ProjectRequest(string? Name);
internal sealed record CreateProjectRequest(string? Name, Guid? TeamId);
internal sealed record ProjectResponse(Guid Id, string Name, string OwnerUserId, DateTime CreatedAt, DateTime? ArchivedAt,
    Guid TeamId, string TeamName, string TeamRole, int RequirementCount);
