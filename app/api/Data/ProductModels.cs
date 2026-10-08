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

// The one GitHub repository a project reads evidence from (ADR-032).
public sealed class ProjectRepository
{
    public Guid ProjectId { get; set; }
    public long InstallationId { get; set; }
    public long RepositoryId { get; set; }
    public required string Owner { get; set; }
    public required string Name { get; set; }
    public bool IsPrivate { get; set; }
    public required string ConnectedBy { get; set; }
    public DateTime ConnectedAt { get; set; }
}

// An issue, pull request, commit, or release linked to a requirement, with what GitHub reported
// when it was last read (ADR-033, ADR-034, ADR-037). Issues and pull requests have Number and
// State; commits have Sha; releases have Tag, and Sha is the commit the tag points at. MergeSha
// is a merged pull request's commit on its target branch. Contains, on a release, is a JSON map
// from the ID of a linked commit or pull request to whether the release's history includes it.
// Commits is a JSON array of a pull request's commits. Checks is a JSON array of the check
// results of a commit or of a pull request's latest commit (ADR-035); null means they were not
// readable. Source says how the link came to be (ADR-036): "manual", or "suggested" and then
// confirmed by the person in LinkedBy.
public sealed class RequirementEvidence
{
    public Guid Id { get; set; }
    public Guid RequirementId { get; set; }
    public required string Kind { get; set; }
    public long RepositoryId { get; set; }
    public required string RepositoryOwner { get; set; }
    public required string RepositoryName { get; set; }
    public int? Number { get; set; }
    public string? Sha { get; set; }
    public string? MergeSha { get; set; }
    public string? Tag { get; set; }
    public bool? Prerelease { get; set; }
    public string? Contains { get; set; }
    public required string Title { get; set; }
    public string? State { get; set; }
    public int? Additions { get; set; }
    public int? Deletions { get; set; }
    public int? ChangedFiles { get; set; }
    public int? CommitCount { get; set; }
    public string? Commits { get; set; }
    public string? Checks { get; set; }
    public int? CheckCount { get; set; }
    public DateTime? ChecksReadAt { get; set; }
    public string Source { get; set; } = "manual";
    public string? Author { get; set; }
    public required string Url { get; set; }
    public DateTime GitHubCreatedAt { get; set; }
    public DateTime GitHubUpdatedAt { get; set; }
    public DateTime? GitHubClosedAt { get; set; }
    public required string LinkedBy { get; set; }
    public DateTime LinkedAt { get; set; }
    public DateTime RefreshedAt { get; set; }
}
