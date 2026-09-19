namespace SpecThread.Api.Data;

public sealed class Project
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public required string OwnerUserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ArchivedAt { get; set; }
}

public sealed class ProjectMember
{
    public Guid ProjectId { get; set; }
    public required string UserId { get; set; }
    public DateTime JoinedAt { get; set; }
}

public sealed class Requirement
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public required string Title { get; set; }
    public required string Description { get; set; }
    public required string CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? ArchivedAt { get; set; }
    public int Version { get; set; } = 1;
}

public sealed class AcceptanceCriterion
{
    public Guid Id { get; set; }
    public Guid RequirementId { get; set; }
    public required string Text { get; set; }
    public int Position { get; set; }
}
