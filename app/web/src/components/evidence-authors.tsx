import { evidenceAuthors, pullRequestsWithUnreadCommits, type Evidence } from "@/lib/evidence";

/**
 * Lists the distinct authors of a requirement's linked commits and pull requests (US-19), so an
 * instructor or reviewer can ask informed questions about who worked on it. Names are listed
 * alphabetically, with no count, score, or ranking. When a pull request has more commits than
 * GitHub listed, it says the list may be incomplete. Nothing renders when no commit or pull
 * request is linked.
 */
export function EvidenceAuthors({ evidence }: { evidence: Evidence[] }) {
  const work = evidence.filter(item => item.kind === "commit" || item.kind === "pull_request");
  if (work.length === 0) return null;
  const authors = evidenceAuthors(work);
  const unread = pullRequestsWithUnreadCommits(work);
  return (
    <div className="evidence-authors">
      <h3 id="evidence-authors-heading">Authors of linked commits and pull requests</h3>
      {authors.length === 0
        ? <p className="muted">GitHub named no author for the linked commits and pull requests.</p>
        : (
          <ul aria-labelledby="evidence-authors-heading">
            {authors.map(author => <li key={author}>{author}</li>)}
          </ul>
        )}
      {unread.length > 0 && (
        <p className="muted">
          Not every commit of {unread.join(", ")} could be read (GitHub lists at most 100 per pull request), so some authors may be missing.
        </p>
      )}
    </div>
  );
}
