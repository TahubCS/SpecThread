using System.Text.Json;
using SpecThread.Api.GitHub;

namespace SpecThread.Api.Requirements;

// The fixed rule for "Evidence complete" until a configurable evidence policy exists (ADR-053).
// It describes the recorded evidence only; it is not acceptance, which a person decides (ADR-004).
internal static class EvidencePolicy
{
    private static readonly JsonSerializerOptions ChecksJson = new(JsonSerializerDefaults.Web);
    private static readonly string[] Code = ["pull_request", "commit"];
    private static readonly string[] Acceptable = ["passed", "skipped", "neutral"];

    // Complete when at least one pull request or commit is linked, the checks of every linked one
    // could be read, none of them failed, is still running, or was cancelled, and at least one passed.
    public static bool IsComplete(IEnumerable<EvidenceChecks> evidence)
    {
        var code = evidence.Where(e => Code.Contains(e.Kind)).ToList();
        if (code.Count == 0) return false;
        var passed = false;
        foreach (var item in code)
        {
            if (item.Checks is null) return false;
            var checks = JsonSerializer.Deserialize<List<EvidenceCheck>>(item.Checks, ChecksJson) ?? [];
            if (checks.Any(c => !Acceptable.Contains(c.Result))) return false;
            passed |= checks.Any(c => c.Result == "passed");
        }
        return passed;
    }
}

// The kind of an evidence link and its stored check results (JSON, or null when unreadable).
internal sealed record EvidenceChecks(string Kind, string? Checks);
