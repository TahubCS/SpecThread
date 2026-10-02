using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;
using SpecThread.Api.Data;

namespace SpecThread.Api.Projects;

// Membership rules shared by product endpoints. See ADR-024.
internal static class ProjectAccess
{
    // The fallback authorization policy guarantees a subject on every product endpoint.
    public static string CallerId(this ClaimsPrincipal user) =>
        user.FindFirstValue(JwtRegisteredClaimNames.Sub)!;

    // Projects the user belongs to, archived or not. Non-members never see a project,
    // so endpoints answer 404 rather than revealing that it exists.
    public static IQueryable<Project> ProjectsFor(this SpecThreadDbContext db, string userId) =>
        db.Projects.Where(p => db.ProjectMembers.Any(m => m.ProjectId == p.Id && m.UserId == userId));
}

// Boundary validation for user-supplied text. Limits are recorded in ADR-024.
internal sealed class InputErrors
{
    public const int MaxNameLength = 200;
    public const int MaxDescriptionLength = 10_000;
    public const int MaxCriteria = 50;
    public const int MaxCriterionLength = 2_000;
    public const int MaxEmailLength = 254;

    private readonly Dictionary<string, string[]> errors = [];

    public bool Any => errors.Count > 0;

    public IDictionary<string, string[]> ToDictionary() => errors;

    // Returns the trimmed value, or null after recording an error.
    public string? Required(string field, string? value, int maxLength)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return Add(field, "Enter a value.");
        if (trimmed.Length > maxLength) return Add(field, $"Use at most {maxLength} characters.");
        return trimmed;
    }

    public string? Optional(string field, string? value, int maxLength)
    {
        var trimmed = value?.Trim() ?? "";
        return trimmed.Length > maxLength ? Add(field, $"Use at most {maxLength} characters.") : trimmed;
    }

    public List<string>? Criteria(string field, IReadOnlyList<string?>? values)
    {
        values ??= [];
        if (values.Count > MaxCriteria)
        {
            Add(field, $"Use at most {MaxCriteria} acceptance criteria.");
            return null;
        }
        var result = new List<string>(values.Count);
        for (var i = 0; i < values.Count; i++)
        {
            var text = Required($"{field}[{i}]", values[i], MaxCriterionLength);
            if (text is not null) result.Add(text);
        }
        return result.Count == values.Count ? result : null;
    }

    public string? Add(string field, string message)
    {
        errors[field] = [message];
        return null;
    }
}
