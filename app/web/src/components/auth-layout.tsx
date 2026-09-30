import type { ReactNode } from "react";
import { Check, Circle, FileText, GitPullRequest, Tag, UserRoundCheck } from "lucide-react";

const evidenceSteps = [
  { label: "Requirement", icon: FileText },
  { label: "Issue", icon: Circle },
  { label: "PR", icon: GitPullRequest },
  { label: "Checks", icon: Check },
  { label: "Release", icon: Tag },
  { label: "Review", icon: UserRoundCheck },
] as const;

/** Places an auth page's panel beside the illustrative requirement-to-review evidence path. */
export function AuthLayout({ children, caption = "Evidence stays inspectable." }: {
  children: ReactNode;
  caption?: string;
}) {
  return (
    <div className="auth-layout">
      {children}
      <aside className="auth-evidence" aria-label="SpecThread evidence path">
        <ol className="auth-evidence-steps">
          {evidenceSteps.map(({ label, icon: Icon }, index) => (
            <li key={label} className={index < 4 ? "is-linked" : "is-pending"}>
              <span className="auth-evidence-node"><Icon size={19} strokeWidth={1.7} aria-hidden="true" /></span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
        <p>{caption}</p>
      </aside>
    </div>
  );
}
