import Link from "next/link";
import { FileText } from "lucide-react";
import { formatDate, type RequirementSummary } from "@/lib/projects";

/** Renders requirements as linked rows with the date each was last changed. */
export function RequirementRows({ requirements, label }: { requirements: RequirementSummary[]; label: string }) {
  return (
    <ul className="row-list" aria-label={label}>
      {requirements.map(requirement => (
        <li key={requirement.id}>
          <Link className="row" href={`/projects/${requirement.projectId}/requirements/${requirement.id}`}>
            <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
            <span className="row-title">{requirement.title}</span>
            <time className="row-meta" dateTime={requirement.updatedAt}>Updated {formatDate(requirement.updatedAt)}</time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
