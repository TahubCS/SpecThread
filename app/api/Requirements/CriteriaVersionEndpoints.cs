using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.Requirements;

// Every saved change to a requirement's acceptance criteria is kept as a numbered version, so a
// decision can be read against the criteria it was made on (ADR-051). Any project member reads
// them, archived or not. Versions are written only by creating and saving requirements.
internal static class CriteriaVersionEndpoints
{
    private static readonly JsonSerializerOptions CriteriaJson = new(JsonSerializerDefaults.Web);

    public static void MapCriteriaVersionEndpoints(this IEndpointRouteBuilder app)
    {
        var versions = app.MapGroup("/requirements/{requirementId:guid}/criteria-versions").WithTags("Requirements")
            .WithMetadata(ProjectEndpoints.Unauthorized);
        versions.MapGet("/", List).WithName("ListCriteriaVersions");
        versions.MapGet("/{number:int}", Get).WithName("GetCriteriaVersion");
    }

    private static async Task<Results<Ok<List<CriteriaVersionResponse>>, NotFound>> List(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (!await IsMemberAsync(db, user.CallerId(), requirementId, cancel)) return TypedResults.NotFound();
        var versions = await db.RequirementCriteriaVersions.AsNoTracking().Where(v => v.RequirementId == requirementId)
            .OrderByDescending(v => v.Number).ToListAsync(cancel);
        return TypedResults.Ok(versions.ConvertAll(ToResponse));
    }

    private static async Task<Results<Ok<CriteriaVersionResponse>, NotFound>> Get(
        Guid requirementId, int number, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (!await IsMemberAsync(db, user.CallerId(), requirementId, cancel)) return TypedResults.NotFound();
        var version = await db.RequirementCriteriaVersions.AsNoTracking()
            .SingleOrDefaultAsync(v => v.RequirementId == requirementId && v.Number == number, cancel);
        return version is null ? TypedResults.NotFound() : TypedResults.Ok(ToResponse(version));
    }

    // The requirement's current criteria and the number of the version that holds them. When the
    // newest version does not match them (none yet, or the previous API saved during a deploy,
    // ADR-044), a catch-up version is added, credited to whoever saved the requirement last. Call
    // after locking the requirement and before changing its criteria.
    internal static async Task<CurrentCriteria> EnsureCurrentAsync(SpecThreadDbContext db, Requirement requirement, CancellationToken cancel)
    {
        var current = await db.AcceptanceCriteria.AsNoTracking().Where(c => c.RequirementId == requirement.Id)
            .OrderBy(c => c.Position).Select(c => c.Text).ToListAsync(cancel);
        var latest = await db.RequirementCriteriaVersions.AsNoTracking().Where(v => v.RequirementId == requirement.Id)
            .OrderByDescending(v => v.Number).FirstOrDefaultAsync(cancel);
        if (latest is not null && ReadCriteria(latest).SequenceEqual(current)) return new(latest.Number, current);
        var number = (latest?.Number ?? 0) + 1;
        Add(db, requirement.Id, number, current, requirement.UpdatedBy ?? requirement.CreatedBy, requirement.UpdatedAt);
        return new(number, current);
    }

    internal static void Add(SpecThreadDbContext db, Guid requirementId, int number, IEnumerable<string> criteria, string userId, DateTime at) =>
        db.RequirementCriteriaVersions.Add(new RequirementCriteriaVersion
        {
            Id = Guid.NewGuid(),
            RequirementId = requirementId,
            Number = number,
            Criteria = JsonSerializer.Serialize(criteria, CriteriaJson),
            CreatedBy = userId,
            CreatedAt = at,
        });

    // The newest version number of each requirement that has one.
    internal static Task<Dictionary<Guid, int>> LatestNumbersAsync(SpecThreadDbContext db, List<Guid> requirementIds, CancellationToken cancel) =>
        db.RequirementCriteriaVersions.AsNoTracking().Where(v => requirementIds.Contains(v.RequirementId))
            .GroupBy(v => v.RequirementId)
            .Select(group => new { RequirementId = group.Key, Number = group.Max(v => v.Number) })
            .ToDictionaryAsync(x => x.RequirementId, x => x.Number, cancel);

    internal static async Task<int?> LatestNumberAsync(SpecThreadDbContext db, Guid requirementId, CancellationToken cancel) =>
        await db.RequirementCriteriaVersions.AsNoTracking().Where(v => v.RequirementId == requirementId)
            .MaxAsync(v => (int?)v.Number, cancel);

    private static List<string> ReadCriteria(RequirementCriteriaVersion version) =>
        JsonSerializer.Deserialize<List<string>>(version.Criteria, CriteriaJson) ?? [];

    // False when the requirement does not exist or the caller is not a member of its project.
    private static Task<bool> IsMemberAsync(SpecThreadDbContext db, string userId, Guid requirementId, CancellationToken cancel) =>
        db.Requirements.Where(r => r.Id == requirementId)
            .Join(db.ProjectsFor(userId), r => r.ProjectId, p => p.Id, (r, p) => r.Id)
            .AnyAsync(cancel);

    private static CriteriaVersionResponse ToResponse(RequirementCriteriaVersion v) =>
        new(v.Number, ReadCriteria(v), v.CreatedBy, v.CreatedAt);
}

internal sealed record CurrentCriteria(int Number, List<string> Criteria);

internal sealed record CriteriaVersionResponse(int Number, List<string> Criteria, string CreatedBy, DateTime CreatedAt);
