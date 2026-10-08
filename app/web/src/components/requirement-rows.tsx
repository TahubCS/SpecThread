import Link from "next/link";
import { FileText } from "lucide-react";
import { evidenceCountText } from "@/lib/evidence";
import { formatDate, type RequirementSummary } from "@/lib/projects";
import { decisionText } from "@/lib/reviews";

/** Renders requirements as linked rows with each one's evidence count, latest decision, and the date it was last changed. */
export function RequirementRows({ requirements, label }: { requirements: RequirementSummary[]; label: string }) {
  return (
    <ul className="row-list" aria-label={label}>
      {requirements.map(requirement => (
        <li key={requirement.id}>
          <Link className="row" href={`/projects/${requirement.projectId}/requirements/${requirement.id}`}>
            <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
            <span className="row-title">{requirement.title}</span>
            <span className="row-meta row-count">{evidenceCountText(requirement.evidenceCount)}</span>
            {requirement.review ? (
              <span className={`badge review-badge is-${requirement.review.decision}${requirement.review.outdated ? " is-outdated" : ""}`}>
                <span aria-hidden="true" />{decisionText[requirement.review.decision]}{requirement.review.outdated && ", outdated"}
              </span>
            ) : <span className="badge review-badge">Not reviewed</span>}
            <time className="row-meta" dateTime={requirement.updatedAt}>Updated {formatDate(requirement.updatedAt)}</time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
