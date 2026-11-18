"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { readAuthConfig } from "@/lib/auth-config";
import { commentNotificationEmail, commentRecipients, parseComment, parseComments, type Comment } from "@/lib/comments";
import { createEmailSender } from "@/lib/email";
import { problemDetail } from "@/lib/evidence";
import { fieldError, isUuid, parseMembers, parseProject } from "@/lib/projects";
import { parseRequirement } from "@/lib/requirements";
import { requireTeamSession } from "@/lib/teams";

/** `changed` counts successful saves, so a form can reset itself; `notice` reports a saved comment whose emails failed. */
export type CommentState = { error: string | null; changed: number; notice?: string };

const detailPath = (projectId: string, requirementId: string) => `/projects/${projectId}/requirements/${requirementId}`;

async function readJson(path: `/${string}`): Promise<unknown> {
  const response = await apiFetch(path);
  if (!response.ok) throw new Error(`GET ${path.split("/").slice(0, 2).join("/")} returned ${response.status}.`);
  return response.json();
}

/**
 * Emails the people following a requirement's discussion about a new comment (ADR-059). Best effort:
 * the comment is already saved, so a failure is reported, never retried. Returns whether every email went.
 */
async function notify(projectId: string, requirementId: string, comment: Comment): Promise<boolean> {
  try {
    const [project, requirement, members, comments] = await Promise.all([
      readJson(`/projects/${projectId}`).then(parseProject), readJson(`/requirements/${requirementId}`).then(parseRequirement),
      readJson(`/projects/${projectId}/members`).then(parseMembers), readJson(`/requirements/${requirementId}/comments`).then(parseComments),
    ]);
    const recipients = commentRecipients({
      requirementAuthorId: requirement.createdBy, comments: comments.comments, parentId: comment.parentId,
      writerId: comment.authorId, members,
    });
    if (recipients.length === 0) return true;
    const config = readAuthConfig(process.env);
    const send = createEmailSender(config.email);
    const url = `${config.baseURL}${detailPath(projectId, requirementId)}#comments`;
    const writerName = members.find(member => member.userId === comment.authorId)?.name ?? "A team member";
    const results = await Promise.allSettled(recipients.map(recipient => send(commentNotificationEmail({
      to: recipient.email, writerName, requirementTitle: requirement.title, projectName: project.name, url, reply: comment.parentId !== null,
    }))));
    const failed = results.filter(result => result.status === "rejected").length;
    // Counts only: addresses and comment text stay out of logs.
    if (failed > 0) console.error(`Comment notification: ${failed} of ${results.length} emails failed.`);
    return failed === 0;
  } catch (error) {
    console.error("Comment notification failed", error instanceof Error ? error.message : "unknown error");
    return false;
  }
}

/** Adds a comment, or a reply when the form carries `parentId`, and emails the discussion's participants. */
export async function addComment(
  projectId: string, requirementId: string, previous: CommentState, formData: FormData,
): Promise<CommentState> {
  const failed = "The comment could not be posted. Please try again.";
  const fail = (error: string): CommentState => ({ error, changed: previous.changed });
  await requireTeamSession(detailPath(projectId, requirementId));
  const body = String(formData.get("body") ?? "");
  const parentId = String(formData.get("parentId") ?? "") || null;
  if (!body.trim()) return fail("Write a comment first.");
  if (!isUuid(projectId) || !isUuid(requirementId) || (parentId !== null && !isUuid(parentId))) return fail(failed);
  let comment: Comment;
  try {
    const response = await apiFetch(`/requirements/${requirementId}/comments`, { method: "POST", body: JSON.stringify({ body, parentId }) });
    if (response.status === 400) {
      const problem = await response.json();
      return fail(fieldError(problem, "body") ?? fieldError(problem, "parentId") ?? failed);
    }
    // 409 explains itself: archived, or the comment being answered was deleted.
    if (response.status === 409) return fail(problemDetail(await response.json()) ?? failed);
    if (!response.ok) throw new Error(`Add comment returned ${response.status}.`);
    comment = parseComment(await response.json());
  } catch (error) {
    console.error("Add comment failed", error);
    return fail(failed);
  }
  const delivered = await notify(projectId, requirementId, comment);
  revalidatePath(detailPath(projectId, requirementId), "layout");
  return {
    error: null, changed: previous.changed + 1,
    notice: delivered ? undefined : "Your comment was posted, but notification emails couldn’t be sent.",
  };
}

/** Saves new text for a comment the signed-in user wrote. */
export async function editComment(
  projectId: string, requirementId: string, previous: CommentState, formData: FormData,
): Promise<CommentState> {
  const failed = "The comment could not be saved. Please try again.";
  const fail = (error: string): CommentState => ({ error, changed: previous.changed });
  await requireTeamSession(detailPath(projectId, requirementId));
  const body = String(formData.get("body") ?? "");
  const commentId = String(formData.get("commentId") ?? "");
  if (!body.trim()) return fail("A comment can’t be empty. Delete it instead.");
  if (!isUuid(projectId) || !isUuid(requirementId) || !isUuid(commentId)) return fail(failed);
  try {
    const response = await apiFetch(`/requirements/${requirementId}/comments/${commentId}`, { method: "PATCH", body: JSON.stringify({ body }) });
    if (response.status === 400) return fail(fieldError(await response.json(), "body") ?? failed);
    if (response.status === 403 || response.status === 409) return fail(problemDetail(await response.json()) ?? failed);
    if (response.status === 404) return fail("This comment is no longer available.");
    if (!response.ok) throw new Error(`Edit comment returned ${response.status}.`);
  } catch (error) {
    console.error("Edit comment failed", error);
    return fail(failed);
  }
  revalidatePath(detailPath(projectId, requirementId), "layout");
  return { error: null, changed: previous.changed + 1 };
}

/** Deletes a comment. Its replies stay; the deletion is kept in the requirement's history. */
export async function deleteComment(
  projectId: string, requirementId: string, previous: CommentState, formData: FormData,
): Promise<CommentState> {
  const failed = "The comment could not be deleted. Please try again.";
  const fail = (error: string): CommentState => ({ error, changed: previous.changed });
  await requireTeamSession(detailPath(projectId, requirementId));
  const commentId = String(formData.get("commentId") ?? "");
  if (!isUuid(projectId) || !isUuid(requirementId) || !isUuid(commentId)) return fail(failed);
  try {
    const response = await apiFetch(`/requirements/${requirementId}/comments/${commentId}`, { method: "DELETE" });
    if (response.status === 403 || response.status === 409) return fail(problemDetail(await response.json()) ?? failed);
    // Already deleted, for example by someone else: show the thread as it is now.
    if (!response.ok && response.status !== 404) throw new Error(`Delete comment returned ${response.status}.`);
  } catch (error) {
    console.error("Delete comment failed", error);
    return fail(failed);
  }
  revalidatePath(detailPath(projectId, requirementId), "layout");
  return { error: null, changed: previous.changed + 1 };
}
