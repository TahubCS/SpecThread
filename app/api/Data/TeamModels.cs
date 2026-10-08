namespace SpecThread.Api.Data;

public sealed class Team
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public required string Description { get; set; }
    public required string OwnerUserId { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class TeamMember
{
    public Guid TeamId { get; set; }
    public required string UserId { get; set; }
    // Ownership comes from Team.OwnerUserId; other members are admins or members.
    public string Role { get; set; } = "member";
    public DateTime JoinedAt { get; set; }
    public bool IsFavorite { get; set; }
    public bool IsExpanded { get; set; } = true;
}

// Completion survives leaving a team and is never inferred from a browser cookie.
public sealed class UserOnboarding
{
    public required string UserId { get; set; }
    public DateTime CompletedAt { get; set; }
}
