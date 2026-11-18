import { expect, test } from "@playwright/test";
import {
  canDeleteComment, canEditComment, commentEventText, commentNotificationEmail, commentRecipients, parseComments, threadComments,
  type Comment, type CommentEvent,
} from "../../app/web/src/lib/comments";
import { formatDateTime } from "../../app/web/src/lib/projects";

// Comment logic in the web app (ADR-059), tested without a browser.
const comment = (id: string, authorId: string, createdAt: string, extra: Partial<Comment> = {}): Comment => ({
  id, parentId: null, authorId, body: `Body ${id}`, createdAt, editedAt: null, deletedAt: null, deletedBy: null, ...extra,
});
const members = [
  { userId: "ada", name: "Ada", email: "ada@example.invalid" },
  { userId: "bob", name: "Bob", email: "bob@example.invalid" },
  { userId: "cy", name: "Cy", email: "cy@example.invalid" },
  { userId: "dee", name: "Dee", email: "dee@example.invalid" },
];

test("parseComments accepts the documented shape and rejects anything else", () => {
  const value = {
    comments: [comment("c1", "ada", "2026-11-18T10:00:00Z", { parentId: null })],
    history: [{ id: "e1", commentId: "c1", parentId: null, authorId: "ada", action: "created", actor: "ada", occurredAt: "2026-11-18T10:00:00Z" }],
  };
  expect(parseComments(value)).toEqual(value);
  expect(() => parseComments({ comments: [] })).toThrow();
  expect(() => parseComments({ comments: [{ ...value.comments[0], body: null }], history: [] })).toThrow();
  expect(() => parseComments({ comments: [], history: [{ ...value.history[0], action: "renamed" }] })).toThrow();
});

test("threadComments orders threads and replies by time and drops deleted comments with nothing under them", () => {
  const threads = threadComments([
    comment("r2", "cy", "2026-11-18T10:05:00Z", { parentId: "c1" }),
    comment("c2", "bob", "2026-11-18T10:02:00Z"),
    comment("r1", "bob", "2026-11-18T10:03:00Z", { parentId: "c1" }),
    comment("c1", "ada", "2026-11-18T10:00:00Z", { deletedAt: "2026-11-18T11:00:00Z", deletedBy: "ada", body: "" }),
    comment("c3", "cy", "2026-11-18T10:04:00Z", { deletedAt: "2026-11-18T11:00:00Z", deletedBy: "cy", body: "" }),
    comment("r3", "ada", "2026-11-18T10:06:00Z", { parentId: "c2", deletedAt: "2026-11-18T11:00:00Z", deletedBy: "ada", body: "" }),
  ]);
  expect(threads.map(thread => [thread.comment.id, thread.replies.map(reply => reply.id)])).toEqual([["c1", ["r1", "r2"]], ["c2", []]]);
});

test("only authors edit, and authors, Owners, and Admins delete", () => {
  const mine = comment("c1", "ada", "2026-11-18T10:00:00Z");
  expect(canEditComment(mine, "ada")).toBe(true);
  expect(canEditComment(mine, "bob")).toBe(false);
  expect(canDeleteComment(mine, "ada", "observer")).toBe(true);
  for (const role of ["owner", "admin"] as const) expect(canDeleteComment(mine, "bob", role)).toBe(true);
  for (const role of ["member", "reviewer", "observer"] as const) expect(canDeleteComment(mine, "bob", role)).toBe(false);
  const gone = { ...mine, deletedAt: "2026-11-18T11:00:00Z", deletedBy: "ada", body: "" };
  expect(canEditComment(gone, "ada")).toBe(false);
  expect(canDeleteComment(gone, "ada", "owner")).toBe(false);
});

test("commentRecipients emails the requirement author and thread participants, never the writer or former members", () => {
  const comments = [
    comment("c1", "bob", "2026-11-18T10:00:00Z"),
    comment("c2", "gone", "2026-11-18T10:01:00Z"),
    comment("r1", "cy", "2026-11-18T10:02:00Z", { parentId: "c1" }),
  ];
  const ids = (writerId: string, parentId: string | null = null) =>
    commentRecipients({ requirementAuthorId: "ada", comments, parentId, writerId, members }).map(member => member.userId);
  expect(ids("cy", "c1")).toEqual(["ada", "bob"]);
  expect(ids("ada")).toEqual(["bob", "cy"]);
  expect(ids("dee")).toEqual(["ada", "bob", "cy"]);
  expect(commentRecipients({ requirementAuthorId: "ada", comments: [], parentId: null, writerId: "ada", members })).toEqual([]);
});

test("commentEventText says who did what to whose comment", () => {
  const names: Record<string, string> = { ada: "Ada", bob: "Bob" };
  const nameOf = (id: string) => names[id] ?? "A former member";
  const event = (action: CommentEvent["action"], actor: string, authorId: string, parentId: string | null = null): CommentEvent =>
    ({ id: "e", commentId: "c", parentId, authorId, action, actor, occurredAt: "2026-11-18T10:00:00Z" });
  expect(commentEventText(event("created", "ada", "ada"), nameOf)).toBe("Ada commented");
  expect(commentEventText(event("created", "bob", "bob", "c0"), nameOf)).toBe("Bob replied to a comment");
  expect(commentEventText(event("edited", "ada", "ada"), nameOf)).toBe("Ada edited their comment");
  expect(commentEventText(event("deleted", "bob", "ada", "c0"), nameOf)).toBe("Bob deleted Ada’s reply");
  expect(commentEventText(event("deleted", "gone", "gone"), nameOf)).toBe("A former member deleted their comment");
});

test("the notification links to the comments without including their text, and escapes names", () => {
  const message = commentNotificationEmail({
    to: "ada@example.invalid", writerName: "Bob <b>", requirementTitle: "Guest checkout", projectName: "Shop",
    url: "https://specthread.example/projects/p/requirements/r#comments", reply: true,
  });
  expect(message.subject).toBe("New reply on Guest checkout");
  expect(message.text).toContain("Bob <b> replied to a comment on “Guest checkout” in Shop.");
  expect(message.text).toContain("View comments: https://specthread.example/projects/p/requirements/r#comments");
  expect(message.html).toContain("Bob &#60;b&#62;");
  expect(message.html).not.toContain("<b>");
  expect(commentNotificationEmail({ ...message, writerName: "Bob", requirementTitle: "T", projectName: "P", url: "u", reply: false }).subject)
    .toBe("New comment on T");
});

test("formatDateTime shows the UTC date and time, so comments on the same day read in order", () => {
  expect(formatDateTime("2026-11-18T14:05:09Z")).toBe("Nov 18, 2026, 2:05 PM UTC");
});
