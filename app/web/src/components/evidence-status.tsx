import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { Term } from "@/components/glossary";
import { EVIDENCE_PARTS, type EvidencePart } from "@/lib/projects";

/** Each part of the rule, with its technical words explained in place (US-17). Reads as EVIDENCE_PART_TEXT. */
const partText: Record<EvidencePart, ReactNode> = {
  issue: <>A linked <Term name="issue">issue</Term></>,
  merged_pull_request: <>A <Term name="merged">merged</Term> <Term name="pull_request">pull request</Term></>,
  passing_checks: <><Term name="check_passed">Checks passed</Term> on the final <Term name="commit">commit</Term> of each merged pull request</>,
  release: <>A linked <Term name="release">release</Term> that includes each merged pull request</>,
};

/**
 * Shows whether a requirement's evidence meets the team's Evidence complete rule and which of its
 * parts are met or missing (ADR-057). It says nothing about acceptance, which is a person's
 * decision in the Review section. Nothing renders when the API sent no status (ADR-044).
 */
export function EvidenceStatus({ complete, missing }: { complete: boolean; missing: EvidencePart[] }) {
  if (!complete && missing.length === 0) return null;
  return (
    <div className="evidence-status">
      <p className="evidence-status-heading">
        {complete
          ? <span className="badge evidence-complete">Evidence complete</span>
          : <span className="badge">Evidence incomplete</span>}
      </p>
      <ul className="evidence-parts" aria-label="Evidence complete rule">
        {EVIDENCE_PARTS.map(part => {
          const met = !missing.includes(part);
          return (
            <li key={part} className={met ? "is-met" : "is-missing"}>
              {met ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
              <span>{partText[part]}</span>
              <span className="evidence-part-state">{met ? "Met" : "Missing"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
