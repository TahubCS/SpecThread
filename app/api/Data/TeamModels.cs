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

public sealed class TeamInvitation
{
    public Guid Id { get; set; }
    public Guid TeamId { get; set; }
    public required string Email { get; set; }
    public required string Role { get; set; }
    public required string InvitedBy { get; set; }
    // Only a SHA-256 digest is stored; the random secret is returned once on issue.
    public required string TokenHash { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime IssuedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? AcceptedAt { get; set; }
    public string? AcceptedBy { get; set; }
    public DateTime? RevokedAt { get; set; }
}
