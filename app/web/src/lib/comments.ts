import type { EmailMessage } from "./email";
import type { TeamRole } from "./team-types";
import { canManageTeam } from "./team-types";

/**
 * A comment on a requirement, or a reply when `parentId` is set (ADR-059). A deleted comment has
 * an empty `body` and keeps its place so its replies stay under it.
 */
export type Comment = {
  id: string; parentId: string | null; authorId: string; body: string; createdAt: string;
  editedAt: string | null; deletedAt: string | null; deletedBy: string | null;
};

/** One created, edited, or deleted comment. `authorId` wrote the comment; `actor` made the change. */
export type CommentEvent = {
  id: string; commentId: string; parentId: string | null; authorId: string;
  action: "created" | "edited" | "deleted"; actor: string; occurredAt: string;
};

/** A requirement's comments, oldest first, and every change to them, newest first. */
export type Comments = { comments: Comment[]; history: CommentEvent[] };

/** A top-level comment with its replies, both oldest first. */
export type CommentThread = { comment: Comment; replies: Comment[] };

export const COMMENT_MAX = 5_000;

const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isOptionalDate = (value: unknown) => value === null || isDate(value);
const isOptionalString = (value: unknown) => value === null || typeof value === "string";

/** Validates one comment from an API response. Throws when the shape is not the documented one. */
export function parseComment(value: unknown): Comment {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.id !== "string" || !isOptionalString(item.parentId) ||
      typeof item.authorId !== "string" || typeof item.body !== "string" || !isDate(item.createdAt) ||
      !isOptionalDate(item.editedAt) || !isOptionalDate(item.deletedAt) || !isOptionalString(item.deletedBy)) {
    throw new Error("The API returned an unexpected comment.");
  }
  return {
    id: item.id, parentId: item.parentId as string | null, authorId: item.authorId, body: item.body, createdAt: item.createdAt,
    editedAt: item.editedAt as string | null, deletedAt: item.deletedAt as string | null, deletedBy: item.deletedBy as string | null,
  };
}

function parseEvent(value: unknown): CommentEvent {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.commentId !== "string" ||
      !isOptionalString(item.parentId) || typeof item.authorId !== "string" ||
      (item.action !== "created" && item.action !== "edited" && item.action !== "deleted") ||
      typeof item.actor !== "string" || !isDate(item.occurredAt)) {
    throw new Error("The API returned an unexpected comment change.");
  }
  return {
    id: item.id, commentId: item.commentId, parentId: item.parentId as string | null, authorId: item.authorId,
    action: item.action, actor: item.actor, occurredAt: item.occurredAt,
  };
}

/** Validates a requirement's comments from an API response. Throws when the shape is not the documented one. */
export function parseComments(value: unknown): Comments {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || !Array.isArray(item.comments) || !Array.isArray(item.history)) {
    throw new Error("The API returned unexpected comments.");
  }
  return { comments: item.comments.map(parseComment), history: item.history.map(parseEvent) };
}

/**
 * Groups comments into threads in the order they were posted. A deleted comment with no replies
 * left has nothing to show, so its thread is dropped; the History page still records it.
 */
export function threadComments(comments: Comment[]): CommentThread[] {
  const byTime = [...comments].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  const threads = new Map<string, CommentThread>();
  for (const comment of byTime) if (comment.parentId === null) threads.set(comment.id, { comment, replies: [] });
  for (const comment of byTime) {
    if (comment.parentId !== null && !comment.deletedAt) threads.get(comment.parentId)?.replies.push(comment);
  }
  return [...threads.values()].filter(thread => !thread.comment.deletedAt || thread.replies.length > 0);
}

/** Only the author edits a comment. */
export function canEditComment(comment: Comment, viewerId: string): boolean {
  return !comment.deletedAt && comment.authorId === viewerId;
}

/** The author deletes a comment, and the team's Owner and Admins remove any comment. */
export function canDeleteComment(comment: Comment, viewerId: string, role: TeamRole): boolean {
  return !comment.deletedAt && (comment.authorId === viewerId || canManageTeam(role));
}

/**
 * Describes one comment change for the History page, such as "Ada replied to a comment" or
 * "Grace deleted Ada’s comment". `nameOf` turns a user ID into a display name.
 */
export function commentEventText(event: CommentEvent, nameOf: (userId: string) => string): string {
  const actor = nameOf(event.actor);
  const noun = event.parentId === null ? "comment" : "reply";
  if (event.action === "created") return event.parentId === null ? `${actor} commented` : `${actor} replied to a comment`;
  const whose = event.actor === event.authorId ? "their" : `${nameOf(event.authorId)}’s`;
  return `${actor} ${event.action} ${whose} ${noun}`;
}

/**
 * Who is emailed about a new comment: the requirement's author, everyone who has commented on it,
 * and for a reply the parent comment's author. Only current members are included, and never the
 * person who wrote the new comment. Sorted by user ID, so the result does not depend on order.
 */
export function commentRecipients({ requirementAuthorId, comments, parentId, writerId, members }: {
  requirementAuthorId: string; comments: Comment[]; parentId: string | null; writerId: string;
  members: { userId: string; name: string; email: string }[];
}): { userId: string; name: string; email: string }[] {
  const ids = new Set([requirementAuthorId, ...comments.map(comment => comment.authorId)]);
  const parent = parentId === null ? undefined : comments.find(comment => comment.id === parentId);
  if (parent) ids.add(parent.authorId);
  ids.delete(writerId);
  return members.filter(member => ids.has(member.userId)).sort((a, b) => a.userId.localeCompare(b.userId));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
}

/**
 * The notification for a new comment or reply. It names who wrote it and on which requirement, and
 * links to the comments; the comment text itself stays in SpecThread, behind sign-in.
 */
export function commentNotificationEmail({ to, writerName, requirementTitle, projectName, url, reply }: {
  to: string; writerName: string; requirementTitle: string; projectName: string; url: string; reply: boolean;
}): EmailMessage {
  const what = reply ? "replied to a comment on" : "commented on";
  const intro = `${writerName} ${what} “${requirementTitle}” in ${projectName}.`;
  const note = "You’re receiving this because you wrote this requirement or took part in its discussion.";
  return {
    to,
    subject: `${reply ? "New reply" : "New comment"} on ${requirementTitle}`,
    text: `${intro}\n\nView comments: ${url}\n\n${note}`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(url)}">View comments</a></p><p>${escapeHtml(note)}</p>`,
  };
}
