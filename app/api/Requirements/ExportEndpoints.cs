using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.Requirements;

// What a project export contains (ADR-068, US-22): a project's active requirements, or one
// milestone's, each with its acceptance criteria, its Evidence complete status (ADR-057), and its
// latest decision with the reviewer's name and the date. The web app turns it into a PDF that
// can be sent to someone who won't sign in. Any member, Observers included, reads it.
internal static class ExportEndpoints
{
    public static void MapExportEndpoints(this IEndpointRouteBuilder app) =>
        app.MapGet("/projects/{projectId:guid}/export", Export).WithName("ExportProject").WithTags("Projects")
            .WithMetadata(ProjectEndpoints.Unauthorized);

    private static async Task<Results<Ok<ExportResponse>, NotFound>> Export(
        Guid projectId, string? milestone, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var project = await db.ProjectsFor(user.CallerId()).AsNoTracking().SingleOrDefaultAsync(p => p.Id == projectId, cancel);
        if (project is null) return TypedResults.NotFound();

        var label = milestone?.Trim();
        var query = db.Requirements.AsNoTracking().Where(r => r.ProjectId == projectId && r.ArchivedAt == null);
        if (!string.IsNullOrEmpty(label)) query = query.Where(r => r.Milestone == label);
        var requirements = await query.OrderBy(r => r.CreatedAt).ThenBy(r => r.Id).ToListAsync(cancel);
        var ids = requirements.ConvertAll(r => r.Id);

        var criteria = (await db.AcceptanceCriteria.AsNoTracking().Where(c => ids.Contains(c.RequirementId))
                .OrderBy(c => c.Position).ToListAsync(cancel))
            .ToLookup(c => c.RequirementId, c => c.Text);
        var evidence = (await db.RequirementEvidence.AsNoTracking().Where(e => ids.Contains(e.RequirementId))
                .Select(e => new { e.RequirementId, Facts = new EvidenceFacts(e.Id, e.Kind, e.State, e.Checks, e.Contains) }).ToListAsync(cancel))
            .ToLookup(e => e.RequirementId, e => e.Facts);
        var reviews = (await db.RequirementReviews.AsNoTracking().Where(v => ids.Contains(v.RequirementId)).ToListAsync(cancel))
            .GroupBy(v => v.RequirementId)
            .ToDictionary(group => group.Key, group => group.OrderByDescending(v => v.DecidedAt).ThenByDescending(v => v.Id).First());
        var reviewers = reviews.Values.Select(v => v.DecidedBy).Distinct().ToList();
        var names = await db.Set<AuthUser>().AsNoTracking().Where(u => reviewers.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name, cancel);
        var criteriaVersions = await CriteriaVersionEndpoints.LatestNumbersAsync(db, ids, cancel);

        var items = requirements.ConvertAll(r =>
        {
            var links = evidence[r.Id].ToList();
            var missing = EvidencePolicy.Missing(links);
            int? criteriaVersion = criteriaVersions.TryGetValue(r.Id, out var number) ? number : null;
            ExportDecision? decision = null;
            if (reviews.TryGetValue(r.Id, out var review))
            {
                var summary = ReviewEndpoints.Summarize(review, r.Version, links.Select(e => e.Id), criteriaVersion);
                decision = new ExportDecision(review.Decision, review.Note, names.GetValueOrDefault(review.DecidedBy, "A former member"),
                    review.DecidedAt, summary.Outdated, summary.CriteriaChanged);
            }
            return new ExportRequirement(r.Id, r.Title, r.Milestone, criteriaVersion, [.. criteria[r.Id]], missing.Count == 0, missing, decision);
        });
        return TypedResults.Ok(new ExportResponse(project.Id, project.Name, string.IsNullOrEmpty(label) ? null : label, Clock.UtcNow(), items));
    }
}

// Decision is "accepted", "rejected", or "more_evidence"; Outdated and CriteriaChanged as in the
// requirement list (ADR-038, ADR-051): the requirement or its evidence changed after it.
internal sealed record ExportDecision(string Decision, string Note, string ReviewerName, DateTime DecidedAt, bool Outdated, bool CriteriaChanged);

internal sealed record ExportRequirement(
    Guid Id, string Title, string? Milestone, int? CriteriaVersion, List<string> AcceptanceCriteria, bool EvidenceComplete,
    List<string> EvidenceMissing, ExportDecision? LatestDecision);

internal sealed record ExportResponse(Guid ProjectId, string ProjectName, string? Milestone, DateTime GeneratedAt, List<ExportRequirement> Requirements);
