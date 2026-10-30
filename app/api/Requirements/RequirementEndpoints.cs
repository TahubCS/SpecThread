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
        requirements.MapPost("/{requirementId:guid}/restore", Restore).WithName("RestoreRequirement")
            .ProducesProblem(StatusCodes.Status409Conflict);
    }

    // Active requirements by default; `archived=true` lists only the archived ones (ADR-050), and
    // `milestone` only those with exactly that label (ADR-053).
    private static async Task<Results<Ok<List<RequirementSummary>>, NotFound>> List(
        Guid projectId, bool? archived, string? milestone, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (!await db.ProjectsFor(user.CallerId()).AnyAsync(p => p.Id == projectId, cancel)) return TypedResults.NotFound();

        var wantArchived = archived == true;
        var query = db.Requirements.AsNoTracking().Where(r => r.ProjectId == projectId && (r.ArchivedAt != null) == wantArchived);
        var label = milestone?.Trim();
        if (!string.IsNullOrEmpty(label)) query = query.Where(r => r.Milestone == label);
        var requirements = await query.OrderBy(r => r.CreatedAt).ThenBy(r => r.Id).ToListAsync(cancel);

        // The latest decision on each requirement, and whether it still describes what is there (ADR-038).
        var ids = requirements.ConvertAll(r => r.Id);
        var reviews = (await db.RequirementReviews.AsNoTracking().Where(v => ids.Contains(v.RequirementId)).ToListAsync(cancel))
            .GroupBy(v => v.RequirementId)
            .ToDictionary(group => group.Key, group => group.OrderByDescending(v => v.DecidedAt).ThenByDescending(v => v.Id).First());
        var evidence = (await db.RequirementEvidence.AsNoTracking().Where(e => ids.Contains(e.RequirementId))
                .Select(e => new { e.RequirementId, e.Id, e.Kind, e.Checks }).ToListAsync(cancel))
            .ToLookup(e => e.RequirementId);
        var criteriaVersions = await CriteriaVersionEndpoints.LatestNumbersAsync(db, ids, cancel);

        return TypedResults.Ok(requirements.ConvertAll(r =>
        {
            var links = evidence[r.Id].ToList();
            int? criteriaVersion = criteriaVersions.TryGetValue(r.Id, out var number) ? number : null;
            return new RequirementSummary(
                r.Id, r.ProjectId, r.Title, r.Version, r.CreatedAt, r.UpdatedAt, r.ArchivedAt, links.Count,
                reviews.TryGetValue(r.Id, out var review)
                    ? ReviewEndpoints.Summarize(review, r.Version, links.Select(e => e.Id), criteriaVersion)
                    : null,
                r.Milestone, criteriaVersion, EvidencePolicy.IsComplete(links.Select(e => new EvidenceChecks(e.Kind, e.Checks))));
        }));
    }

    private static async Task<Results<Created<RequirementResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Create(
        Guid projectId, RequirementRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var input = Validate(request.Title, request.Description, request.AcceptanceCriteria, request.DocumentIds, out var errors);
        var milestone = errors.Milestone("milestone", request.Milestone);
        if (input is null || errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var userId = user.CallerId();
        // Serialize with archiving, membership changes, and other writes in this project's team.
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var project = await ProjectEndpoints.LockProjectForCaller(db, projectId, userId, cancel);
        if (project is null) return TypedResults.NotFound();
        if (project.ArchivedAt is not null) return ProjectEndpoints.Archived();
        var refused = await CheckDocuments(db, projectId, input.DocumentIds, new HashSet<Guid>(), cancel);
        if (refused is not null) return refused;

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
            UpdatedBy = userId,
            Version = 1,
            Milestone = milestone,
        };
        db.Requirements.Add(requirement);
        var criteria = AddCriteria(db, requirement.Id, input.Criteria);
        CriteriaVersionEndpoints.Add(db, requirement.Id, 1, input.Criteria, userId, now);
        LinkDocuments(db, requirement.Id, input.DocumentIds, userId, now);
        await db.SaveChangesAsync(cancel);
        var documents = await LoadDocuments(db, requirement.Id, cancel);
        await transaction.CommitAsync(cancel);

        return TypedResults.Created($"/requirements/{requirement.Id}", ToResponse(requirement, criteria, documents, 1));
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
        return TypedResults.Ok(ToResponse(requirement.Requirement, criteria, await LoadDocuments(db, requirementId, cancel),
            await CriteriaVersionEndpoints.LatestNumberAsync(db, requirementId, cancel)));
    }

    // Replaces the whole criteria and document lists; a stale version means someone else saved first.
    // Changed criteria become a new criteria version. When the latest decision accepted the
    // current criteria, changing them needs `confirmCriteriaChange`, because that acceptance
    // applies to the previous criteria and the requirement will need a new review (ADR-051).
    private static async Task<Results<Ok<RequirementResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Update(
        Guid requirementId, UpdateRequirementRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var input = Validate(request.Title, request.Description, request.AcceptanceCriteria, request.DocumentIds, out var errors);
        if (request.Version is null) errors.Add("version", "Send the version you loaded.");
        if (input is null || errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var userId = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var found = await LockForMember(db, userId, requirementId, cancel);
        if (found is null) return TypedResults.NotFound();
        var requirement = found.Requirement;
        if (found.ProjectArchived || requirement.ArchivedAt is not null) return ProjectEndpoints.Archived();
        if (requirement.Version != request.Version) return Stale();

        var (criteriaVersion, currentCriteria) = await CriteriaVersionEndpoints.EnsureCurrentAsync(db, requirement, cancel);
        var criteriaChanged = !input.Criteria.SequenceEqual(currentCriteria);
        if (criteriaChanged && request.ConfirmCriteriaChange != true)
        {
            var latest = await db.RequirementReviews.AsNoTracking().Where(v => v.RequirementId == requirementId)
                .OrderByDescending(v => v.DecidedAt).ThenByDescending(v => v.Id).FirstOrDefaultAsync(cancel);
            if (latest is { Decision: "accepted" } && latest.CriteriaVersion == criteriaVersion) return AcceptedCriteriaChange(criteriaVersion);
        }

        // Kept links keep who linked them and when; only removed ones go and only new ones are added.
        var links = await db.RequirementDocuments.Where(l => l.RequirementId == requirementId).ToListAsync(cancel);
        var linked = links.Select(l => l.DocumentId).ToHashSet();
        var refused = await CheckDocuments(db, requirement.ProjectId, input.DocumentIds, linked, cancel);
        if (refused is not null) return refused;
        db.RequirementDocuments.RemoveRange(links.Where(l => !input.DocumentIds.Contains(l.DocumentId)));

        // Delete first so new positions never collide with the unique (requirement_id, position) index.
        await db.AcceptanceCriteria.Where(c => c.RequirementId == requirementId).ExecuteDeleteAsync(cancel);
        var now = Clock.UtcNow();
        requirement.Title = input.Title;
        requirement.Description = input.Description;
        requirement.UpdatedAt = now;
        requirement.UpdatedBy = userId;
        requirement.Version++;
        var criteria = AddCriteria(db, requirementId, input.Criteria);
        if (criteriaChanged) CriteriaVersionEndpoints.Add(db, requirementId, ++criteriaVersion, input.Criteria, userId, now);
        LinkDocuments(db, requirementId, input.DocumentIds.Where(id => !linked.Contains(id)), userId, now);
        try
        {
            await db.SaveChangesAsync(cancel);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Stale(); // Disposing the transaction rolls back the criteria deletion.
        }
        var documents = await LoadDocuments(db, requirementId, cancel);
        await transaction.CommitAsync(cancel);

        return TypedResults.Ok(ToResponse(requirement, criteria, documents, criteriaVersion));
    }

    private static Task<Results<Ok<RequirementResponse>, NotFound, ProblemHttpResult>> Archive(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel) =>
        SetArchived(requirementId, true, user, db, cancel);

    // Any member restores, as any member archives. Restoring is not an edit: the version, the
    // last editor, and the reviews stay as they were, so a decision that was current still is.
    private static Task<Results<Ok<RequirementResponse>, NotFound, ProblemHttpResult>> Restore(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel) =>
        SetArchived(requirementId, false, user, db, cancel);

    private static async Task<Results<Ok<RequirementResponse>, NotFound, ProblemHttpResult>> SetArchived(
        Guid requirementId, bool archived, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var found = await LockForMember(db, user.CallerId(), requirementId, cancel);
        if (found is null) return TypedResults.NotFound();
        if (found.ProjectArchived) return ProjectEndpoints.Archived();

        // Idempotent: archiving again keeps the original timestamp, and restoring an active one changes nothing.
        found.Requirement.ArchivedAt = archived ? found.Requirement.ArchivedAt ?? Clock.UtcNow() : null;
        try
        {
            await db.SaveChangesAsync(cancel);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Stale();
        }
        await transaction.CommitAsync(cancel);

        var criteria = await db.AcceptanceCriteria.AsNoTracking()
            .Where(c => c.RequirementId == requirementId)
            .OrderBy(c => c.Position)
            .ToListAsync(cancel);
        return TypedResults.Ok(ToResponse(found.Requirement, criteria, await LoadDocuments(db, requirementId, cancel),
            await CriteriaVersionEndpoints.LatestNumberAsync(db, requirementId, cancel)));
    }

    // Like FindForMember, but locks the project's team first and then reads the requirement, so
    // the archived states and membership it sees cannot change before this transaction ends.
    // Call inside a transaction. Every requirement-scoped write (evidence, reviews) uses it.
    internal static async Task<MemberRequirement?> LockForMember(
        SpecThreadDbContext db, string userId, Guid requirementId, CancellationToken cancel)
    {
        var projectId = await db.Requirements.Where(r => r.Id == requirementId).Select(r => (Guid?)r.ProjectId).SingleOrDefaultAsync(cancel);
        if (projectId is null) return null;
        var project = await ProjectEndpoints.LockProjectForCaller(db, projectId.Value, userId, cancel);
        if (project is null) return null;
        var requirement = await db.Requirements.SingleAsync(r => r.Id == requirementId, cancel);
        return new MemberRequirement(requirement, project.ArchivedAt != null);
    }

    // Null when the requirement does not exist or the caller is not a member of its project.
    private static Task<MemberRequirement?> FindForMember(
        IQueryable<Requirement> requirements, SpecThreadDbContext db, string userId, Guid requirementId, CancellationToken cancel) =>
        requirements.Where(r => r.Id == requirementId)
            .Join(db.ProjectsFor(userId), r => r.ProjectId, p => p.Id, (r, p) => new MemberRequirement(r, p.ArchivedAt != null))
            .SingleOrDefaultAsync(cancel);

    private static ValidInput? Validate(
        string? title, string? description, IReadOnlyList<string?>? criteria, IReadOnlyList<Guid>? documentIds, out InputErrors errors)
    {
        errors = new InputErrors();
        var validTitle = errors.Required("title", title, InputErrors.MaxNameLength);
        var validDescription = errors.Optional("description", description, InputErrors.MaxDescriptionLength);
        var validCriteria = errors.Criteria("acceptanceCriteria", criteria);
        documentIds ??= [];
        if (documentIds.Count > InputErrors.MaxRequirementDocuments)
        {
            errors.Add("documentIds", $"Link at most {InputErrors.MaxRequirementDocuments} documents.");
        }
        else if (documentIds.Distinct().Count() != documentIds.Count)
        {
            errors.Add("documentIds", "Link each document once.");
        }
        return errors.Any ? null : new ValidInput(validTitle!, validDescription!, validCriteria!, [.. documentIds]);
    }

    // Documents come from the requirement's project. Archived ones stay linked but can't be newly linked.
    // Call after locking the project's team, so a document can't be archived between this check and the save.
    private static async Task<ValidationProblem?> CheckDocuments(
        SpecThreadDbContext db, Guid projectId, List<Guid> documentIds, IReadOnlySet<Guid> linked, CancellationToken cancel)
    {
        if (documentIds.Count == 0) return null;
        var found = await db.Documents.Where(d => d.ProjectId == projectId && documentIds.Contains(d.Id))
            .Select(d => new { d.Id, d.ArchivedAt }).ToListAsync(cancel);
        string? message = null;
        if (found.Count != documentIds.Count) message = "Choose documents from this project's Documentation tab.";
        else if (found.Any(d => d.ArchivedAt is not null && !linked.Contains(d.Id))) message = "An archived document can't be newly linked.";
        return message is null ? null
            : TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["documentIds"] = [message] });
    }

    private static void LinkDocuments(SpecThreadDbContext db, Guid requirementId, IEnumerable<Guid> documentIds, string userId, DateTime now) =>
        db.RequirementDocuments.AddRange(documentIds.Select(id => new RequirementDocument
        {
            RequirementId = requirementId,
            DocumentId = id,
            LinkedBy = userId,
            LinkedAt = now,
        }));

    private static Task<List<LinkedDocumentResponse>> LoadDocuments(SpecThreadDbContext db, Guid requirementId, CancellationToken cancel) =>
        db.RequirementDocuments.AsNoTracking().Where(l => l.RequirementId == requirementId)
            .Join(db.Documents, l => l.DocumentId, d => d.Id, (l, d) => new { Link = l, Document = d })
            .OrderBy(x => x.Document.Title).ThenBy(x => x.Document.Id)
            .Select(x => new LinkedDocumentResponse(x.Document.Id, x.Document.Title, x.Document.FileName, x.Document.ContentType,
                x.Document.ArchivedAt, x.Link.LinkedBy, x.Link.LinkedAt))
            .ToListAsync(cancel);

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

    internal static ProblemHttpResult Stale() => TypedResults.Problem(
        "This requirement changed since it was loaded. Reload it and try again.", statusCode: StatusCodes.Status409Conflict);

    private static ProblemHttpResult AcceptedCriteriaChange(int criteriaVersion) => TypedResults.Problem(
        $"This requirement was accepted against criteria version {criteriaVersion}. That acceptance applies to the previous criteria, " +
        "so saving new criteria means it needs a new review. Confirm the change to save it.",
        statusCode: StatusCodes.Status409Conflict,
        extensions: new Dictionary<string, object?> { ["code"] = "accepted_criteria_change", ["acceptedCriteriaVersion"] = criteriaVersion });

    // `criteriaVersion` is null only for a requirement the previous API created during a deploy (ADR-044).
    private static RequirementResponse ToResponse(
        Requirement r, IEnumerable<AcceptanceCriterion> criteria, List<LinkedDocumentResponse> documents, int? criteriaVersion) => new(
        r.Id, r.ProjectId, r.Title, r.Description, r.CreatedBy, r.UpdatedBy ?? r.CreatedBy, r.Version, r.CreatedAt, r.UpdatedAt, r.ArchivedAt,
        criteria.Select(c => new CriterionResponse(c.Id, c.Text, c.Position)).ToList(), documents, criteriaVersion, r.Milestone);

    internal sealed record MemberRequirement(Requirement Requirement, bool ProjectArchived)
    {
        public bool Archived => ProjectArchived || Requirement.ArchivedAt is not null;
    }

    private sealed record ValidInput(string Title, string Description, List<string> Criteria, List<Guid> DocumentIds);
}

internal sealed record RequirementRequest(
    string? Title, string? Description, List<string?>? AcceptanceCriteria, List<Guid>? DocumentIds, string? Milestone = null);

internal sealed record UpdateRequirementRequest(
    string? Title, string? Description, List<string?>? AcceptanceCriteria, List<Guid>? DocumentIds, int? Version,
    bool? ConfirmCriteriaChange = null);

internal sealed record RequirementSummary(
    Guid Id, Guid ProjectId, string Title, int Version, DateTime CreatedAt, DateTime UpdatedAt, DateTime? ArchivedAt, int EvidenceCount, ReviewSummary? Review,
    string? Milestone, int? CriteriaVersion, bool EvidenceComplete);

internal sealed record RequirementResponse(
    Guid Id, Guid ProjectId, string Title, string Description, string CreatedBy, string UpdatedBy, int Version,
    DateTime CreatedAt, DateTime UpdatedAt, DateTime? ArchivedAt, List<CriterionResponse> AcceptanceCriteria,
    List<LinkedDocumentResponse> Documents, int? CriteriaVersion, string? Milestone);

internal sealed record CriterionResponse(Guid Id, string Text, int Position);

internal sealed record LinkedDocumentResponse(
    Guid Id, string Title, string FileName, string ContentType, DateTime? ArchivedAt, string LinkedBy, DateTime LinkedAt);
