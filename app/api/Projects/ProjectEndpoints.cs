using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;

namespace SpecThread.Api.Projects;

// Any member reads a project; only the owner renames or archives it (ADR-024).
internal static class ProjectEndpoints
{
    // Every product endpoint requires a token, so each can answer 401.
    internal static readonly ProducesResponseTypeMetadata Unauthorized = new(StatusCodes.Status401Unauthorized, typeof(void));

    public static void MapProjectEndpoints(this IEndpointRouteBuilder app)
    {
        var projects = app.MapGroup("/projects").WithTags("Projects")
            .WithMetadata(Unauthorized);

        projects.MapGet("/", List).WithName("ListProjects");
        projects.MapPost("/", Create).WithName("CreateProject")
            .ProducesProblem(StatusCodes.Status403Forbidden);
        projects.MapGet("/{projectId:guid}", Get).WithName("GetProject");
        projects.MapPatch("/{projectId:guid}", Rename).WithName("RenameProject")
            .ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict);
        projects.MapPost("/{projectId:guid}/archive", Archive).WithName("ArchiveProject")
            .ProducesProblem(StatusCodes.Status403Forbidden);
    }

    private static async Task<Ok<List<ProjectResponse>>> List(
        ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var items = await db.ProjectsFor(user.CallerId())
            .Where(p => p.ArchivedAt == null)
            .OrderBy(p => p.Name).ThenBy(p => p.Id)
            .Select(p => new ProjectResponse(p.Id, p.Name, p.OwnerUserId, p.CreatedAt, p.ArchivedAt))
            .ToListAsync(cancel);
        return TypedResults.Ok(items);
    }

    private static async Task<Results<Created<ProjectResponse>, ValidationProblem, ProblemHttpResult>> Create(
        ProjectRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var name = errors.Required("name", request.Name, InputErrors.MaxNameLength);
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var userId = user.CallerId();
        if (!await db.Set<AuthUser>().AnyAsync(u => u.Id == userId, cancel))
        {
            return TypedResults.Problem("The signed-in user has no account record.", statusCode: StatusCodes.Status403Forbidden);
        }

        var project = new Project { Id = Guid.NewGuid(), Name = name!, OwnerUserId = userId, CreatedAt = DateTime.UtcNow };
        db.Projects.Add(project);
        db.ProjectMembers.Add(new ProjectMember { ProjectId = project.Id, UserId = userId, JoinedAt = project.CreatedAt });
        await db.SaveChangesAsync(cancel); // One transaction: project and owner membership.

        return TypedResults.Created($"/projects/{project.Id}", ToResponse(project));
    }

    private static async Task<Results<Ok<ProjectResponse>, NotFound>> Get(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var project = await db.ProjectsFor(user.CallerId()).AsNoTracking()
            .SingleOrDefaultAsync(p => p.Id == projectId, cancel);
        return project is null ? TypedResults.NotFound() : TypedResults.Ok(ToResponse(project));
    }

    private static async Task<Results<Ok<ProjectResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Rename(
        Guid projectId, ProjectRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var name = errors.Required("name", request.Name, InputErrors.MaxNameLength);
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var userId = user.CallerId();
        var project = await db.ProjectsFor(userId).SingleOrDefaultAsync(p => p.Id == projectId, cancel);
        if (project is null) return TypedResults.NotFound();
        if (project.OwnerUserId != userId) return OwnerOnly();
        if (project.ArchivedAt is not null) return Archived();

        project.Name = name!;
        await db.SaveChangesAsync(cancel);
        return TypedResults.Ok(ToResponse(project));
    }

    private static async Task<Results<Ok<ProjectResponse>, NotFound, ProblemHttpResult>> Archive(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var userId = user.CallerId();
        var project = await db.ProjectsFor(userId).SingleOrDefaultAsync(p => p.Id == projectId, cancel);
        if (project is null) return TypedResults.NotFound();
        if (project.OwnerUserId != userId) return OwnerOnly();

        // Idempotent: archiving again keeps the original timestamp.
        project.ArchivedAt ??= DateTime.UtcNow;
        await db.SaveChangesAsync(cancel);
        return TypedResults.Ok(ToResponse(project));
    }

    internal static ProblemHttpResult Archived() =>
        TypedResults.Problem("Archived items cannot be changed.", statusCode: StatusCodes.Status409Conflict);

    internal static ProblemHttpResult OwnerOnly() =>
        TypedResults.Problem("Only the project owner can do this.", statusCode: StatusCodes.Status403Forbidden);

    private static ProjectResponse ToResponse(Project p) =>
        new(p.Id, p.Name, p.OwnerUserId, p.CreatedAt, p.ArchivedAt);
}

internal sealed record ProjectRequest(string? Name);

internal sealed record ProjectResponse(Guid Id, string Name, string OwnerUserId, DateTime CreatedAt, DateTime? ArchivedAt);
