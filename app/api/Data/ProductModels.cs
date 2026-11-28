namespace SpecThread.Api.Data;

public sealed class Project
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public Guid TeamId { get; set; }
    // Historical creator, retained in the existing column. Team roles grant management.
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
    // Who saved the current version. Null only for a requirement created by an API older than
    // migration RequirementUpdatedBy after that migration ran; read it as the creator (ADR-050).
    public string? UpdatedBy { get; set; }
    public DateTime? ArchivedAt { get; set; }
    // One milestone or sprint label, or null (ADR-053). Setting it is not an edit: it does not
    // change Version, so a decision never becomes outdated because of it.
    public string? Milestone { get; set; }
    public int Version { get; set; } = 1;
}

// A requirement's acceptance criteria as they were saved at one point (ADR-051). Criteria is a
// JSON array of the criterion texts in order. A new version is written only when that list
// changes, numbered from 1 per requirement. Rows are only ever added.
public sealed class RequirementCriteriaVersion
{
    public Guid Id { get; set; }
    public Guid RequirementId { get; set; }
    public int Number { get; set; }
    public required string Criteria { get; set; }
    public required string CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }
}

// A release of the project's connected repository recorded as deployed to an environment on a
// date (ADR-066). Tag, Name, Sha (the commit the tag points at), Url, Author, Prerelease, and
// PublishedAt are GitHub's, read when it was recorded. Contains is a JSON map from the ID of each
// linked commit or merged pull request in the project, as of ComparedAt, to whether the release's
// history includes it, so the requirements it includes are found without asking GitHub again.
public sealed class ProjectRelease
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public long RepositoryId { get; set; }
    public required string Tag { get; set; }
    public required string Name { get; set; }
    public required string Sha { get; set; }
    public required string Url { get; set; }
    public string? Author { get; set; }
    public bool Prerelease { get; set; }
    public DateTime PublishedAt { get; set; }
    public required string Environment { get; set; }
    public DateOnly DeployedOn { get; set; }
    public required string RecordedBy { get; set; }
    public DateTime RecordedAt { get; set; }
    public required string Contains { get; set; }
    public DateTime ComparedAt { get; set; }
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

// A comment on a requirement, or a reply to one (ADR-059). Comments are discussion: they never
// change the requirement, its version, its evidence, or its review status. ParentId is null for a
// top-level comment; a reply's parent is always top-level. Deleting keeps the row, so replies stay
// in place, but clears Body: removed text is not kept.
public sealed class RequirementComment
{
    public Guid Id { get; set; }
    public Guid RequirementId { get; set; }
    public Guid? ParentId { get; set; }
    public required string AuthorId { get; set; }
    public required string Body { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? EditedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
    public string? DeletedBy { get; set; }
}

// Who created, edited, or deleted a comment, and when (ADR-059). Action is "created", "edited",
// or "deleted". Earlier text is not recorded. Rows are only ever added.
public sealed class RequirementCommentEvent
{
    public Guid Id { get; set; }
    public Guid RequirementId { get; set; }
    public Guid CommentId { get; set; }
    public required string Action { get; set; }
    public required string Actor { get; set; }
    public DateTime OccurredAt { get; set; }
}

// One requirement marked as a follow-up of another in the same project (ADR-052). Linking does
// not change either requirement's version.
public sealed class RequirementFollowUp
{
    public Guid RequirementId { get; set; }
    public Guid OriginalRequirementId { get; set; }
    public required string LinkedBy { get; set; }
    public DateTime LinkedAt { get; set; }
}

// Who added or removed a follow-up link, and when (ADR-052). Action is "added" or "removed".
// Rows are only ever added.
public sealed class RequirementFollowUpEvent
{
    public Guid Id { get; set; }
    public Guid RequirementId { get; set; }
    public Guid OriginalRequirementId { get; set; }
    public required string Action { get; set; }
    public required string Actor { get; set; }
    public DateTime OccurredAt { get; set; }
}

// A change to a requirement's evidence, with who made it and when (ADR-054, ADR-056). Action is
// "added", "removed", "confirmed" or "rejected" (a suggestion), or "moved_in" or "moved_out",
// where OtherRequirementId is the requirement on the other side of the move. Kind, Label, and
// Title are copied from the link, which a removal deletes. EvidenceId is the link's ID, or a
// rejected suggestion's, kept without a foreign key for the same reason. Rows are only ever added.
public sealed class RequirementEvidenceEvent
{
    public Guid Id { get; set; }
    public Guid RequirementId { get; set; }
    public Guid EvidenceId { get; set; }
    public required string Action { get; set; }
    public required string Kind { get; set; }
    public required string Label { get; set; }
    public required string Title { get; set; }
    public required string Actor { get; set; }
    public DateTime OccurredAt { get; set; }
    public Guid? OtherRequirementId { get; set; }
}

// A pull request whose text closes an issue linked to the requirement (ADR-056). It is not
// evidence: nothing reads this table when counting, reviewing, or judging evidence, and it enters
// requirement_evidence only when a person confirms it (ADR-036). Status is "pending",
// "confirmed", or "rejected"; a decided row stays, so the same pull request is not suggested
// again. Reference is the keyword and issue found, such as "Closes #184", never the text around it.
public sealed class RequirementEvidenceSuggestion
{
    public Guid Id { get; set; }
    public Guid RequirementId { get; set; }
    public long RepositoryId { get; set; }
    public int Number { get; set; }
    public required string Title { get; set; }
    public required string State { get; set; }
    public string? Author { get; set; }
    public required string Url { get; set; }
    public required string Reference { get; set; }
    public string Status { get; set; } = "pending";
    public DateTime FoundAt { get; set; }
    public string? DecidedBy { get; set; }
    public DateTime? DecidedAt { get; set; }
}

// A person's decision on a requirement (ADR-038). Evidence is a JSON array of the evidence links
// as they were when the decision was made. Rows are only ever added.
public sealed class RequirementReview
{
    public Guid Id { get; set; }
    public Guid RequirementId { get; set; }
    public required string Decision { get; set; }
    public required string Note { get; set; }
    public int RequirementVersion { get; set; }
    // The criteria version the decision was made against (ADR-051). Null for a decision recorded
    // before criteria versions were kept on an earlier requirement version, or by an older API.
    public int? CriteriaVersion { get; set; }
    public required string Evidence { get; set; }
    public required string DecidedBy { get; set; }
    public DateTime DecidedAt { get; set; }
}

// Metadata only; the bytes live in DocumentContent so lists never load files (ADR-047).
public sealed class Document
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public required string Title { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public long SizeBytes { get; set; }
    public required string UploadedBy { get; set; }
    public DateTime UploadedAt { get; set; }
    public DateTime? ArchivedAt { get; set; }
}

public sealed class DocumentContent
{
    public Guid DocumentId { get; set; }
    public required byte[] Content { get; set; }
}

// A project document a requirement cites, saved with the requirement like its criteria (ADR-049).
public sealed class RequirementDocument
{
    public Guid RequirementId { get; set; }
    public Guid DocumentId { get; set; }
    public required string LinkedBy { get; set; }
    public DateTime LinkedAt { get; set; }
}
