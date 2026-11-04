using System.Text.Json;
using SpecThread.Api.GitHub;

namespace SpecThread.Api.Requirements;

// The team's fixed rule for "Evidence complete" until a configurable evidence policy exists
// (ADR-056, replacing ADR-053's rule). It describes the recorded evidence only; it is not
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
    //   check, or a check that failed, is still running, or was cancelled; also when none is merged.
    // `release`: a merged pull request is not in the history of any linked release; also when
    //   none is merged.
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

    // Checks pass when they could be read, at least one passed, and the rest passed, were skipped, or were neutral.
    private static bool ChecksPassed(string? stored)
    {
        if (stored is null) return false;
        var checks = JsonSerializer.Deserialize<List<EvidenceCheck>>(stored, Json) ?? [];
        return checks.Exists(c => c.Result == "passed") && checks.TrueForAll(c => Acceptable.Contains(c.Result));
    }

    // Which linked changes a release's history includes, by evidence ID; empty when not yet read (ADR-037).
    private static Dictionary<Guid, bool> ReadContains(string? stored) =>
        stored is null ? [] : JsonSerializer.Deserialize<Dictionary<Guid, bool>>(stored, Json) ?? [];
}

// What the rule reads from one evidence link: its kind, GitHub state, stored check results (JSON,
// or null when unreadable), and for a release which linked changes it contains (JSON, or null).
internal sealed record EvidenceFacts(Guid Id, string Kind, string? State, string? Checks, string? Contains);
