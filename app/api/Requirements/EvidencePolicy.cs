using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.GitHub;

namespace SpecThread.Api.Requirements;

// The team's fixed rule for "Evidence complete" until a configurable evidence policy exists
// (ADR-057, replacing ADR-053's rule). It describes the recorded evidence only; it is not
// acceptance, which a person decides (ADR-004).
internal static class EvidencePolicy
{
    public const string Issue = "issue";
    public const string MergedPullRequest = "merged_pull_request";
    public const string PassingChecks = "passing_checks";
    public const string Release = "release";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly string[] Acceptable = ["passed", "skipped", "neutral"];

    // The parts of the rule the evidence does not meet, in this order:
    // `issue`: no issue is linked.
    // `merged_pull_request`: no merged pull request is linked.
    // `passing_checks`: a merged pull request's final commit has unreadable checks, no passed
    //   check, or a check whose newest run failed, is still running, or was cancelled; also when
    //   none is merged.
    // `release`: a merged pull request is not in the history of any linked release, nor of any
    //   release recorded for the project (ADR-069), which callers pass in as release facts;
    //   also when none is merged.
    // Linked commits and unmerged pull requests neither count toward nor block it.
    public static List<string> Missing(IReadOnlyCollection<EvidenceFacts> evidence)
    {
        var missing = new List<string>();
        if (!evidence.Any(e => e.Kind == "issue")) missing.Add(Issue);

        var merged = evidence.Where(e => e.Kind == "pull_request" && e.State == "merged").ToList();
        if (merged.Count == 0) return [.. missing, MergedPullRequest, PassingChecks, Release];

        if (!merged.TrueForAll(pr => ChecksPassed(pr.Checks))) missing.Add(PassingChecks);
        var releases = evidence.Where(e => e.Kind == "release").Select(e => ReadContains(e.Contains)).ToList();
        if (!merged.TrueForAll(pr => releases.Exists(contains => contains.GetValueOrDefault(pr.Id)))) missing.Add(Release);
        return missing;
    }

    // Checks pass when they could be read, at least one passed, and the rest passed, were skipped, or
    // were neutral. Only the newest run of each check counts: a run that a re-run superseded is
    // history, shown on the page but not what the check reports now (ADR-063).
    private static bool ChecksPassed(string? stored)
    {
        if (stored is null) return false;
        var checks = (JsonSerializer.Deserialize<List<EvidenceCheck>>(stored, Json) ?? []).FindAll(c => !c.Superseded);
        return checks.Exists(c => c.Result == "passed") && checks.TrueForAll(c => Acceptable.Contains(c.Result));
    }

    // The releases recorded for a project (ADR-066), as release facts for `Missing`: each one's
    // comparison is keyed by evidence ID, as a linked release's is, so a recorded release that
    // GitHub found contains a requirement's merged pull request meets the release part (ADR-069).
    // Any environment counts. Pass them alongside a requirement's own links, never in place of them.
    public static async Task<List<EvidenceFacts>> RecordedReleasesAsync(SpecThreadDbContext db, Guid projectId, CancellationToken cancel) =>
        await db.ProjectReleases.AsNoTracking().Where(r => r.ProjectId == projectId)
            .Select(r => new EvidenceFacts(r.Id, "release", null, null, r.Contains)).ToListAsync(cancel);

    // Which linked changes a release's history includes, by evidence ID; empty when not yet read (ADR-037).
    private static Dictionary<Guid, bool> ReadContains(string? stored) =>
        stored is null ? [] : JsonSerializer.Deserialize<Dictionary<Guid, bool>>(stored, Json) ?? [];
}

// What the rule reads from one evidence link: its kind, GitHub state, stored check results (JSON,
// or null when unreadable), and for a release which linked changes it contains (JSON, or null).
internal sealed record EvidenceFacts(Guid Id, string Kind, string? State, string? Checks, string? Contains);
