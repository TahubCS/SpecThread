"use client";

import { useActionState, useState } from "react";
import { addComment, deleteComment, editComment, type CommentState } from "@/app/projects/comment-actions";
import { COMMENT_MAX, canDeleteComment, canEditComment, threadComments, type Comment, type Comments } from "@/lib/comments";
import { formatDateTime } from "@/lib/projects";
import type { TeamRole } from "@/lib/team-types";

type Context = {
  projectId: string;
  requirementId: string;
  viewerId: string;
  role: TeamRole;
  /** Names of the project's members by user ID. */
  people: Record<string, string>;
  /** False while the requirement or project is archived: the discussion is read-only. */
  open: boolean;
};

const initial: CommentState = { error: null, changed: 0 };

/**
 * The requirement's discussion (ADR-059): top-level comments oldest first, each with its replies.
 * Every team member, Observers included, can comment and reply while the requirement is open.
 * Comments never change the requirement, its evidence, or its review status.
 */
export function RequirementComments({ comments, ...context }: Context & { comments: Comments | null }) {
  const [added, add, adding] = useActionState(addComment.bind(null, context.projectId, context.requirementId), initial);
  // Controlled, because React resets a form's uncontrolled fields after every action, even a failed one.
  const [draft, setDraft] = useState("");
  const [posted, setPosted] = useState(0);
  if (added.changed !== posted) {
    setPosted(added.changed);
    setDraft("");
  }
  if (comments === null) return <p className="notice" role="status">Comments can&apos;t be shown right now. Try again in a few minutes.</p>;
  const threads = threadComments(comments.comments);

  return (
    <>
      {threads.length === 0
        ? <p className="muted">No comments yet.</p>
        : (
          <ol className="comment-list" aria-label="Comments">
            {threads.map(thread => (
              <li key={thread.comment.id}>
                <CommentItem comment={thread.comment} context={context} />
                {thread.replies.length > 0 && (
                  <ol className="comment-replies" aria-label={`Replies to ${nameOf(context, thread.comment.authorId)}`}>
                    {thread.replies.map(reply => <li key={reply.id}><CommentItem comment={reply} context={context} /></li>)}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        )}
      {context.open ? (
        <form className="comment-form" action={add} aria-label="New comment">
          <div className="field">
            <label htmlFor="new-comment">Add a comment</label>
            <textarea id="new-comment" name="body" required maxLength={COMMENT_MAX} rows={3}
              value={draft} onChange={event => setDraft(event.target.value)}
              aria-invalid={added.error ? true : undefined} aria-describedby="new-comment-hint" />
            <p id="new-comment-hint" className="muted">Comments don&apos;t change the requirement, its evidence, or its review status.</p>
            {added.error && <p role="alert" className="notice notice-error">{added.error}</p>}
          </div>
          <button className="button secondary" type="submit" disabled={adding}>{adding ? "Posting..." : "Post comment"}</button>
        </form>
      ) : <p className="muted">This requirement is archived, so its discussion is read-only.</p>}
      {added.notice && <p role="status" className="notice">{added.notice}</p>}
    </>
  );
}

function nameOf(context: Context, userId: string) {
  return userId === context.viewerId ? "You" : context.people[userId] ?? "A former member";
}

/** One comment with its author, time, and the Reply, Edit, and Delete actions the viewer may use. */
function CommentItem({ comment, context }: { comment: Comment; context: Context }) {
  const bind = <T,>(action: (p: string, r: string, s: CommentState, f: FormData) => Promise<T>) =>
    action.bind(null, context.projectId, context.requirementId);
  const [edited, edit, editing] = useActionState(bind(editComment), initial);
  const [deleted, remove, deleting] = useActionState(bind(deleteComment), initial);
  const [replied, reply, replying] = useActionState(bind(addComment), initial);
  const [mode, setMode] = useState<"view" | "edit" | "reply" | "delete">("view");
  const [editText, setEditText] = useState(comment.body);
  const [replyText, setReplyText] = useState("");
  // A successful save closes the form it came from.
  const [seen, setSeen] = useState({ edited: 0, replied: 0 });
  if (edited.changed !== seen.edited || replied.changed !== seen.replied) {
    if (replied.changed !== seen.replied) setReplyText("");
    setSeen({ edited: edited.changed, replied: replied.changed });
    setMode("view");
  }
  const author = nameOf(context, comment.authorId);
  const label = comment.parentId === null ? "comment" : "reply";

  if (comment.deletedAt) {
    return (
      <article className="comment is-deleted" aria-label={`Deleted ${label}`}>
        <p className="muted">This {label} was deleted.</p>
      </article>
    );
  }
  return (
    <article className="comment" aria-label={`${label === "comment" ? "Comment" : "Reply"} by ${author}`}>
      <p className="comment-meta">
        <strong>{author}</strong>{" "}
        <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
        {comment.editedAt && <span className="muted"> · Edited <time dateTime={comment.editedAt}>{formatDateTime(comment.editedAt)}</time></span>}
      </p>
      {mode === "edit" ? (
        <form action={edit}>
          <input type="hidden" name="commentId" value={comment.id} />
          <div className="field">
            <label htmlFor={`edit-${comment.id}`}>Edit {label}</label>
            <textarea id={`edit-${comment.id}`} name="body" required maxLength={COMMENT_MAX} rows={3}
              value={editText} onChange={event => setEditText(event.target.value)} aria-invalid={edited.error ? true : undefined} />
            {edited.error && <p role="alert" className="notice notice-error">{edited.error}</p>}
          </div>
          <div className="form-actions">
            <button className="button secondary" type="submit" disabled={editing}>{editing ? "Saving..." : `Save ${label}`}</button>
            <button className="button secondary" type="button" disabled={editing} onClick={() => setMode("view")}>Cancel</button>
          </div>
        </form>
      ) : <p className="comment-body">{comment.body}</p>}
      {context.open && mode !== "edit" && (
        <div className="comment-actions">
          {comment.parentId === null && (
            <button className="link-button" type="button" aria-expanded={mode === "reply"}
              onClick={() => setMode(mode === "reply" ? "view" : "reply")}>Reply</button>
          )}
          {canEditComment(comment, context.viewerId) && (
            <button className="link-button" type="button" onClick={() => { setEditText(comment.body); setMode("edit"); }}>Edit</button>
          )}
          {canDeleteComment(comment, context.viewerId, context.role) && (
            <button className="link-button" type="button" onClick={() => setMode("delete")}>Delete</button>
          )}
        </div>
      )}
      {mode === "delete" && (
        <form className="form-actions" action={remove} aria-label={`Confirm deleting ${author === "You" ? "your" : `${author}’s`} ${label}`}>
          <input type="hidden" name="commentId" value={comment.id} />
          <span>Delete this {label}? {comment.parentId === null && "Replies stay."}</span>
          <button className="button danger" type="submit" disabled={deleting}>{deleting ? "Deleting..." : `Delete ${label}`}</button>
          <button className="button secondary" type="button" disabled={deleting} onClick={() => setMode("view")}>Cancel</button>
        </form>
      )}
      {deleted.error && <p role="alert" className="notice notice-error">{deleted.error}</p>}
      {mode === "reply" && (
        <form action={reply}>
          <input type="hidden" name="parentId" value={comment.id} />
          <div className="field">
            <label htmlFor={`reply-${comment.id}`}>Reply to {author}</label>
            <textarea id={`reply-${comment.id}`} name="body" required maxLength={COMMENT_MAX} rows={2}
              value={replyText} onChange={event => setReplyText(event.target.value)} aria-invalid={replied.error ? true : undefined} />
            {replied.error && <p role="alert" className="notice notice-error">{replied.error}</p>}
          </div>
          <div className="form-actions">
            <button className="button secondary" type="submit" disabled={replying}>{replying ? "Posting..." : "Post reply"}</button>
            <button className="button secondary" type="button" disabled={replying} onClick={() => setMode("view")}>Cancel</button>
          </div>
        </form>
      )}
      {replied.notice && <p role="status" className="notice">{replied.notice}</p>}
    </article>
  );
}
