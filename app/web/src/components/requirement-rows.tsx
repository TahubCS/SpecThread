import Link from "next/link";
import { FileText } from "lucide-react";
import { evidenceCountText } from "@/lib/evidence";
import { EVIDENCE_PART_SHORT, formatDate, type RequirementSummary } from "@/lib/projects";
import { reviewStatus } from "@/lib/reviews";

/**
 * Renders requirements as linked rows with each one's milestone, evidence count, whether its
 * evidence is complete or which parts it is missing (ADR-056), its review status, and the date it
 * was last changed or archived.
 */
export function RequirementRows({ requirements, label }: { requirements: RequirementSummary[]; label: string }) {
  return (
    <ul className="row-list" aria-label={label}>
      {requirements.map(requirement => {
        const status = reviewStatus(requirement.review);
        return (
          <li key={requirement.id}>
            <Link className="row" href={`/projects/${requirement.projectId}/requirements/${requirement.id}`}>
              <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="row-title">{requirement.title}</span>
              {requirement.milestone && <span className="milestone-label">{requirement.milestone}</span>}
              <span className="row-meta row-count">{evidenceCountText(requirement.evidenceCount)}</span>
              {requirement.evidenceComplete && <span className="badge evidence-complete">Evidence complete</span>}
              {requirement.evidenceMissing.length > 0 && (
                <span className="row-meta evidence-missing">
                  Missing {requirement.evidenceMissing.map(part => EVIDENCE_PART_SHORT[part]).join(", ")}
                </span>
              )}
              <span className={`badge review-badge${status.tone ? ` is-${status.tone}` : ""}${status.outdated ? " is-outdated" : ""}`}>
                {status.tone && <span aria-hidden="true" />}{status.text}
              </span>
              {requirement.archivedAt
                ? <time className="row-meta" dateTime={requirement.archivedAt}>Archived {formatDate(requirement.archivedAt)}</time>
                : <time className="row-meta" dateTime={requirement.updatedAt}>Updated {formatDate(requirement.updatedAt)}</time>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
