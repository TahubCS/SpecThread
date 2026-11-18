using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.Requirements;

// Discussion on a requirement (ADR-059). Every team member, Observers included, reads and adds
// comments and replies; comments never change the requirement, its evidence, or its review status.
// Authors edit their own comments. Authors, the Owner, and Admins delete them. Each creation,
// edit, and deletion is recorded with who did it and when, without the earlier text.
internal static class CommentEndpoints
{
    public static void MapCommentEndpoints(this IEndpointRouteBuilder app)
    {
        var comments = app.MapGroup("/requirements/{requirementId:guid}/comments").WithTags("Requirements")
            .WithMetadata(ProjectEndpoints.Unauthorized);
        comments.MapGet("/", List).WithName("ListComments");
        comments.MapPost("/", Add).WithName("AddComment").ProducesProblem(StatusCodes.Status409Conflict);
        comments.MapPatch("/{commentId:guid}", Edit).WithName("EditComment")
            .ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict);
        comments.MapDelete("/{commentId:guid}", Delete).WithName("DeleteComment")
            .ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict);
    }

    private static async Task<Results<Ok<CommentsResponse>, NotFound>> List(
        Guid requirementId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var member = await db.Requirements.Where(r => r.Id == requirementId)
            .Join(db.ProjectsFor(user.CallerId()), r => r.ProjectId, p => p.Id, (r, p) => r.Id).AnyAsync(cancel);
        if (!member) return TypedResults.NotFound();

        // One snapshot for both reads, so a deletion in between can't show in one list and not the other.
        await using var snapshot = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, cancel);
        var comments = await db.RequirementComments.AsNoTracking().Where(c => c.RequirementId == requirementId)
            .OrderBy(c => c.CreatedAt).ThenBy(c => c.Id)
            .Select(c => new CommentResponse(c.Id, c.ParentId, c.AuthorId, c.Body, c.CreatedAt, c.EditedAt, c.DeletedAt, c.DeletedBy))
            .ToListAsync(cancel);
        var history = await db.RequirementCommentEvents.AsNoTracking().Where(e => e.RequirementId == requirementId)
            .Join(db.RequirementComments, e => e.CommentId, c => c.Id, (e, c) => new { Event = e, c.AuthorId, c.ParentId })
            .OrderByDescending(x => x.Event.OccurredAt).ThenByDescending(x => x.Event.Id)
            .Select(x => new CommentEventResponse(x.Event.Id, x.Event.CommentId, x.ParentId, x.AuthorId, x.Event.Action, x.Event.Actor, x.Event.OccurredAt))
            .ToListAsync(cancel);
        return TypedResults.Ok(new CommentsResponse(comments, history));
    }

    private static async Task<Results<Created<CommentResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Add(
        Guid requirementId, AddCommentRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var body = Body(errors, request.Body);
        if (request.ParentId == Guid.Empty) errors.Add("parentId", "Choose a comment to reply to.");
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var userId = user.CallerId();
        // Serialize with archiving and membership changes in this project's team.
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var found = await RequirementEndpoints.LockForMember(db, userId, requirementId, cancel);
        if (found is null) return TypedResults.NotFound();
        if (found.Archived) return ProjectEndpoints.Archived();
        if (request.ParentId is Guid parentId)
        {
            var parent = await db.RequirementComments.AsNoTracking()
                .SingleOrDefaultAsync(c => c.Id == parentId && c.RequirementId == requirementId, cancel);
            if (parent is null)
            {
                return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["parentId"] = ["Choose a comment on this requirement."] });
            }
            // One level of replies keeps each topic in one place.
            if (parent.ParentId is not null)
            {
                return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["parentId"] = ["Reply to the original comment instead."] });
            }
            if (parent.DeletedAt is not null) return Conflict("That comment was deleted, so it can't be replied to.");
        }

        var comment = new RequirementComment
        {
            Id = Guid.NewGuid(),
            RequirementId = requirementId,
            ParentId = request.ParentId,
            AuthorId = userId,
            Body = body!,
            CreatedAt = Clock.UtcNow(),
        };
        db.RequirementComments.Add(comment);
        Record(db, comment, "created", userId, comment.CreatedAt);
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Created($"/requirements/{requirementId}/comments/{comment.Id}", Response(comment));
    }

    private static async Task<Results<Ok<CommentResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Edit(
        Guid requirementId, Guid commentId, EditCommentRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var body = Body(errors, request.Body);
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var userId = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var found = await RequirementEndpoints.LockForMember(db, userId, requirementId, cancel);
        if (found is null) return TypedResults.NotFound();
        var comment = await db.RequirementComments.SingleOrDefaultAsync(c => c.Id == commentId && c.RequirementId == requirementId, cancel);
        if (comment is null) return TypedResults.NotFound();
        if (comment.AuthorId != userId)
        {
            return TypedResults.Problem("Only the author can edit a comment.", statusCode: StatusCodes.Status403Forbidden);
        }
        if (comment.DeletedAt is not null) return Conflict("A deleted comment can't be edited.");
        if (found.Archived) return ProjectEndpoints.Archived();
        // Saving the same text is not an edit, so nothing is recorded.
        if (comment.Body == body) return TypedResults.Ok(Response(comment));

        var now = Clock.UtcNow();
        comment.Body = body!;
        comment.EditedAt = now;
        Record(db, comment, "edited", userId, now);
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Ok(Response(comment));
    }

    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Delete(
        Guid requirementId, Guid commentId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var userId = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var found = await RequirementEndpoints.LockForMember(db, userId, requirementId, cancel);
        if (found is null) return TypedResults.NotFound();
        var comment = await db.RequirementComments.SingleOrDefaultAsync(c => c.Id == commentId && c.RequirementId == requirementId, cancel);
        // Already deleted, for example by someone else, reads as gone.
        if (comment is null || comment.DeletedAt is not null) return TypedResults.NotFound();
        if (comment.AuthorId != userId && !TeamRoles.CanManage(found.Role))
        {
            return TypedResults.Problem("Only the author, the Owner, or an Admin can delete a comment.", statusCode: StatusCodes.Status403Forbidden);
        }
        if (found.Archived) return ProjectEndpoints.Archived();

        var now = Clock.UtcNow();
        comment.Body = "";
        comment.DeletedAt = now;
        comment.DeletedBy = userId;
        Record(db, comment, "deleted", userId, now);
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.NoContent();
    }

    // PostgreSQL text can't hold a NUL character, so it is refused here rather than failing the save.
    private static string? Body(InputErrors errors, string? value) =>
        value?.Contains('\0') == true ? errors.Add("body", "Remove the invalid character.") : errors.Required("body", value, InputErrors.MaxCommentLength);

    private static void Record(SpecThreadDbContext db, RequirementComment comment, string action, string userId, DateTime at) =>
        db.RequirementCommentEvents.Add(new RequirementCommentEvent
        {
            Id = Guid.NewGuid(),
            RequirementId = comment.RequirementId,
            CommentId = comment.Id,
            Action = action,
            Actor = userId,
            OccurredAt = at,
        });

    private static CommentResponse Response(RequirementComment c) =>
        new(c.Id, c.ParentId, c.AuthorId, c.Body, c.CreatedAt, c.EditedAt, c.DeletedAt, c.DeletedBy);

    private static ProblemHttpResult Conflict(string detail) => TypedResults.Problem(detail, statusCode: StatusCodes.Status409Conflict);
}

internal sealed record AddCommentRequest(string? Body, Guid? ParentId);

internal sealed record EditCommentRequest(string? Body);

// A comment or reply. A deleted comment has an empty Body and keeps its place, so replies stay under it.
internal sealed record CommentResponse(
    Guid Id, Guid? ParentId, string AuthorId, string Body, DateTime CreatedAt, DateTime? EditedAt, DateTime? DeletedAt, string? DeletedBy);

// One created, edited, or deleted comment. ParentId and AuthorId describe the comment, Actor who acted.
internal sealed record CommentEventResponse(
    Guid Id, Guid CommentId, Guid? ParentId, string AuthorId, string Action, string Actor, DateTime OccurredAt);

internal sealed record CommentsResponse(List<CommentResponse> Comments, List<CommentEventResponse> History);
