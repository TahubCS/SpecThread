using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.Requirements;

// Any project member reads and edits requirements and their acceptance criteria (ADR-024).
internal static class RequirementEndpoints
{
    public static void MapRequirementEndpoints(this IEndpointRouteBuilder app)
    {
        var byProject = app.MapGroup("/projects/{projectId:guid}/requirements").WithTags("Requirements")
            .WithMetadata(ProjectEndpoints.Unauthorized);
        byProject.MapGet("/", List).WithName("ListRequirements");
        byProject.MapPost("/", Create).WithName("CreateRequirement")
            .ProducesProblem(StatusCodes.Status409Conflict);

        var requirements = app.MapGroup("/requirements").WithTags("Requirements")
            .WithMetadata(ProjectEndpoints.Unauthorized);
        requirements.MapGet("/{requirementId:guid}", Get).WithName("GetRequirement");
        requirements.MapPut("/{requirementId:guid}", Update).WithName("UpdateRequirement")
            .ProducesProblem(StatusCodes.Status409Conflict);
        requirements.MapPost("/{requirementId:guid}/archive", Archive).WithName("ArchiveRequirement")
            .ProducesProblem(StatusCodes.Status409Conflict);
    }

    private static async Task<Results<Ok<List<RequirementSummary>>, NotFound>> List(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (!await db.ProjectsFor(user.CallerId()).AnyAsync(p => p.Id == projectId, cancel)) return TypedResults.NotFound();

        var items = await db.Requirements
            .Where(r => r.ProjectId == projectId && r.ArchivedAt == null)
            .OrderBy(r => r.CreatedAt).ThenBy(r => r.Id)
            .Select(r => new RequirementSummary(r.Id, r.ProjectId, r.Title, r.Version, r.CreatedAt, r.UpdatedAt, r.ArchivedAt))
            .ToListAsync(cancel);
        return TypedResults.Ok(items);
    }

    private static async Task<Results<Created<RequirementResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Create(
        Guid projectId, RequirementRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var input = Validate(request.Title, request.Description, request.AcceptanceCriteria, out var errors);
        if (input is null) return TypedResults.ValidationProblem(errors.ToDictionary());

        var userId = user.CallerId();
        var project = await db.ProjectsFor(userId).AsNoTracking().SingleOrDefaultAsync(p => p.Id == projectId, cancel);
        if (project is null) return TypedResults.NotFound();
        if (project.ArchivedAt is not null) return ProjectEndpoints.Archived();

        var now = Clock.UtcNow();
        var requirement = new Requirement
        {
            Id = Guid.NewGuid(),
            ProjectId = projectId,
            Title = input.Title,
            Description = input.Description,
            CreatedBy = userId,
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1,
        };
        db.Requirements.Add(requirement);
        var criteria = AddCriteria(db, requirement.Id, input.Criteria);
        await db.SaveChangesAsync(cancel); // One transaction: requirement and criteria.

        return TypedResults.Created($"/requirements/{requirement.Id}", ToResponse(requirement, criteria));
    }

    private static async Task<Results<Ok<RequirementResponse>, NotFound>> Get(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var requirement = await FindForMember(db.Requirements.AsNoTracking(), db, user.CallerId(), requirementId, cancel);
        if (requirement is null) return TypedResults.NotFound();

        var criteria = await db.AcceptanceCriteria.AsNoTracking()
            .Where(c => c.RequirementId == requirementId)
            .OrderBy(c => c.Position)
            .ToListAsync(cancel);
        return TypedResults.Ok(ToResponse(requirement.Requirement, criteria));
    }

    // Replaces the whole criteria list; a stale version means someone else saved first.
    private static async Task<Results<Ok<RequirementResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Update(
        Guid requirementId, UpdateRequirementRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var input = Validate(request.Title, request.Description, request.AcceptanceCriteria, out var errors);
        if (request.Version is null) errors.Add("version", "Send the version you loaded.");
        if (input is null || errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var found = await FindForMember(db.Requirements, db, user.CallerId(), requirementId, cancel);
        if (found is null) return TypedResults.NotFound();
        var requirement = found.Requirement;
        if (found.ProjectArchived || requirement.ArchivedAt is not null) return ProjectEndpoints.Archived();
        if (requirement.Version != request.Version) return Stale();

        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        // Delete first so new positions never collide with the unique (requirement_id, position) index.
        await db.AcceptanceCriteria.Where(c => c.RequirementId == requirementId).ExecuteDeleteAsync(cancel);
        requirement.Title = input.Title;
        requirement.Description = input.Description;
        requirement.UpdatedAt = Clock.UtcNow();
        requirement.Version++;
        var criteria = AddCriteria(db, requirementId, input.Criteria);
        try
        {
            await db.SaveChangesAsync(cancel);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Stale(); // Disposing the transaction rolls back the criteria deletion.
        }
        await transaction.CommitAsync(cancel);

        return TypedResults.Ok(ToResponse(requirement, criteria));
    }

    private static async Task<Results<Ok<RequirementResponse>, NotFound, ProblemHttpResult>> Archive(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var found = await FindForMember(db.Requirements, db, user.CallerId(), requirementId, cancel);
        if (found is null) return TypedResults.NotFound();
        if (found.ProjectArchived) return ProjectEndpoints.Archived();

        // Idempotent: archiving again keeps the original timestamp.
        found.Requirement.ArchivedAt ??= Clock.UtcNow();
        try
        {
            await db.SaveChangesAsync(cancel);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Stale();
        }

        var criteria = await db.AcceptanceCriteria.AsNoTracking()
            .Where(c => c.RequirementId == requirementId)
            .OrderBy(c => c.Position)
            .ToListAsync(cancel);
        return TypedResults.Ok(ToResponse(found.Requirement, criteria));
    }

    // Null when the requirement does not exist or the caller is not a member of its project.
    private static Task<MemberRequirement?> FindForMember(
        IQueryable<Requirement> requirements, SpecThreadDbContext db, string userId, Guid requirementId, CancellationToken cancel) =>
        requirements.Where(r => r.Id == requirementId)
            .Join(db.ProjectsFor(userId), r => r.ProjectId, p => p.Id, (r, p) => new MemberRequirement(r, p.ArchivedAt != null))
            .SingleOrDefaultAsync(cancel);

    private static ValidInput? Validate(string? title, string? description, IReadOnlyList<string?>? criteria, out InputErrors errors)
    {
        errors = new InputErrors();
        var validTitle = errors.Required("title", title, InputErrors.MaxNameLength);
        var validDescription = errors.Optional("description", description, InputErrors.MaxDescriptionLength);
        var validCriteria = errors.Criteria("acceptanceCriteria", criteria);
        return errors.Any ? null : new ValidInput(validTitle!, validDescription!, validCriteria!);
    }

    private static List<AcceptanceCriterion> AddCriteria(SpecThreadDbContext db, Guid requirementId, List<string> texts)
    {
        var criteria = texts.Select((text, position) => new AcceptanceCriterion
        {
            Id = Guid.NewGuid(),
            RequirementId = requirementId,
            Text = text,
            Position = position,
        }).ToList();
        db.AcceptanceCriteria.AddRange(criteria);
        return criteria;
    }

    private static ProblemHttpResult Stale() => TypedResults.Problem(
        "This requirement changed since it was loaded. Reload it and try again.", statusCode: StatusCodes.Status409Conflict);

    private static RequirementResponse ToResponse(Requirement r, IEnumerable<AcceptanceCriterion> criteria) => new(
        r.Id, r.ProjectId, r.Title, r.Description, r.CreatedBy, r.Version, r.CreatedAt, r.UpdatedAt, r.ArchivedAt,
        criteria.Select(c => new CriterionResponse(c.Id, c.Text, c.Position)).ToList());

    private sealed record MemberRequirement(Requirement Requirement, bool ProjectArchived);

    private sealed record ValidInput(string Title, string Description, List<string> Criteria);
}

internal sealed record RequirementRequest(string? Title, string? Description, List<string?>? AcceptanceCriteria);

internal sealed record UpdateRequirementRequest(string? Title, string? Description, List<string?>? AcceptanceCriteria, int? Version);

internal sealed record RequirementSummary(
    Guid Id, Guid ProjectId, string Title, int Version, DateTime CreatedAt, DateTime UpdatedAt, DateTime? ArchivedAt);

internal sealed record RequirementResponse(
    Guid Id, Guid ProjectId, string Title, string Description, string CreatedBy, int Version,
    DateTime CreatedAt, DateTime UpdatedAt, DateTime? ArchivedAt, List<CriterionResponse> AcceptanceCriteria);

internal sealed record CriterionResponse(Guid Id, string Text, int Position);
