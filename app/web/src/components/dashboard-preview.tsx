"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowDownUp, Check, ChevronDown, Circle, FileText,
  GitPullRequest, ListFilter, Plus, Tag, UserRoundCheck,
} from "lucide-react";

type GroupId = "review" | "missing" | "recent";
type ViewGroupId = GroupId | "all";
type TabId = "attention" | "recent" | "all";
type Step = { label: string; state: "linked" | "pending" };
type PreviewRequirement = {
  id: string;
  title: string;
  project: string;
  summary: string;
  updated: string;
  group: GroupId;
  note: string;
  steps: readonly Step[];
};

const requirements: readonly PreviewRequirement[] = [
  { id: "ST-104", title: "Invite teammates", project: "Example team", summary: "Review requested", updated: "Sep 24", group: "review", note: "Release missing · review pending", steps: [
    { label: "Requirement", state: "linked" }, { label: "Issue #42", state: "linked" },
    { label: "PR #87", state: "linked" }, { label: "Checks", state: "linked" },
    { label: "Release", state: "pending" }, { label: "Review", state: "pending" },
  ] },
  { id: "ST-117", title: "Export project report", project: "Personal", summary: "Awaiting review", updated: "Sep 24", group: "review", note: "Review pending", steps: [
    { label: "Requirement", state: "linked" }, { label: "Issue #51", state: "linked" },
    { label: "PR #92", state: "linked" }, { label: "Checks", state: "linked" },
    { label: "Release", state: "linked" }, { label: "Review", state: "pending" },
  ] },
  { id: "ST-098", title: "Connect GitHub repository", project: "Example team", summary: "No linked pull request", updated: "Sep 24", group: "missing", note: "Pull request evidence missing", steps: [
    { label: "Requirement", state: "linked" }, { label: "Issue #23", state: "linked" },
    { label: "Pull request", state: "pending" }, { label: "Checks", state: "pending" },
    { label: "Release", state: "pending" }, { label: "Review", state: "pending" },
  ] },
  { id: "ST-091", title: "Generate release notes", project: "Example team", summary: "No release linked", updated: "Sep 24", group: "missing", note: "Release evidence missing", steps: [
    { label: "Requirement", state: "linked" }, { label: "Issue #18", state: "linked" },
    { label: "PR #31", state: "linked" }, { label: "Checks", state: "linked" },
    { label: "Release", state: "pending" }, { label: "Review", state: "pending" },
  ] },
  { id: "ST-120", title: "Define authentication requirements", project: "Example team", summary: "Updated description", updated: "Sep 23", group: "recent", note: "Implementation evidence has not been linked", steps: [
    { label: "Requirement", state: "linked" }, { label: "Issue", state: "pending" },
    { label: "Pull request", state: "pending" }, { label: "Checks", state: "pending" },
    { label: "Release", state: "pending" }, { label: "Review", state: "pending" },
  ] },
  { id: "ST-115", title: "Set up staging environment", project: "Example team", summary: "Added acceptance criteria", updated: "Sep 23", group: "recent", note: "Implementation evidence has not been linked", steps: [
    { label: "Requirement", state: "linked" }, { label: "Issue", state: "pending" },
    { label: "Pull request", state: "pending" }, { label: "Checks", state: "pending" },
    { label: "Release", state: "pending" }, { label: "Review", state: "pending" },
  ] },
];

const groups: readonly { id: GroupId; title: string }[] = [
  { id: "review", title: "Needs review" },
  { id: "missing", title: "Missing evidence" },
  { id: "recent", title: "Recently updated" },
];

const threadIcons = [FileText, Circle, GitPullRequest, Check, Tag, UserRoundCheck] as const;

/**
 * Renders a sample requirement's evidence as a checklist with its note.
 * Steps use the requirement, issue, pull request, checks, release, and review icon order.
 */
function EvidencePreview({ requirement }: { requirement: PreviewRequirement }) {
  return (
    <div className="evidence-preview" id={`thread-${requirement.id}`}>
      <div className="evidence-preview-header">
        <span className="evidence-preview-heading">Evidence</span>
        <p className="evidence-note">{requirement.note}</p>
      </div>
      <ol className="evidence-list" aria-label={`Evidence path for ${requirement.id}`}>
        {requirement.steps.map((step, index) => {
          const Icon = threadIcons[index];
          return (
            <li key={`${step.label}-${index}`} className={step.state}>
              <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
              <span className="evidence-item-label">{step.label}</span>
              <span className="evidence-item-state">{step.state === "linked" ? "Linked" : "Not linked"}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Renders how many of a sample requirement's evidence steps are linked, as a ring and a count. */
function EvidenceProgress({ steps }: { steps: readonly Step[] }) {
  const linked = steps.filter(step => step.state === "linked").length;
  return (
    <span className="dashboard-progress">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="8" cy="8" r="6" />
        <circle cx="8" cy="8" r="6" pathLength={steps.length} strokeDasharray={`${linked} ${steps.length}`} />
      </svg>
      <span aria-hidden="true">{linked}/{steps.length}</span>
      <span className="sr-only">{linked} of {steps.length} evidence steps linked.</span>
    </span>
  );
}

/**
 * Renders sample requirements with local view, filtering, ordering, and expansion controls.
 * The action filter excludes the recent group; ordering reverses rows within each group.
 * Interactions do not persist changes to product data.
 */
export function DashboardPreview() {
  const [tab, setTab] = useState<TabId>("attention");
  const [selected, setSelected] = useState<string | null>("ST-104");
  const [closedGroups, setClosedGroups] = useState<ViewGroupId[]>([]);
  const [actionOnly, setActionOnly] = useState(false);
  const [reverseOrder, setReverseOrder] = useState(false);
  const visibleGroups: readonly { id: ViewGroupId; title: string }[] =
    tab === "recent" ? (actionOnly ? [] : groups.filter(group => group.id === "recent")) :
    tab === "all" ? [{ id: "all", title: "All requirements" }] :
    groups.filter(group => !actionOnly || group.id !== "recent");

  return (
    <section className="dashboard-preview" aria-labelledby="dashboard-heading">
      <header className="dashboard-header">
        <div>
          <h1 id="dashboard-heading">Your work</h1>
          <p className="dashboard-preview-label">Preview · Sample requirements, no project data connected</p>
        </div>
        <Link className="button" href="/projects/new"><Plus size={16} aria-hidden="true" /> New project</Link>
      </header>
      <div className="dashboard-toolbar">
        <div className="dashboard-tabs" role="tablist" aria-label="Dashboard view">
          {([ ["attention", "Attention"], ["recent", "Recent"], ["all", "All"] ] as const).map(([id, label]) => (
            <button key={id} id={`dashboard-tab-${id}`} type="button" role="tab"
              aria-controls="dashboard-results" aria-selected={tab === id}
              className={tab === id ? "is-selected" : ""} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="dashboard-controls">
          <button type="button" className={`icon-button${actionOnly ? " is-on" : ""}`}
            aria-label="Show only items needing action" aria-pressed={actionOnly}
            onClick={() => setActionOnly(value => !value)}><ListFilter size={18} aria-hidden="true" /></button>
          <button type="button" className="icon-button" aria-label="Reverse row order"
            aria-pressed={reverseOrder} onClick={() => setReverseOrder(value => !value)}>
            <ArrowDownUp size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="dashboard-groups" id="dashboard-results" role="tabpanel"
        aria-labelledby={`dashboard-tab-${tab}`}>
        {visibleGroups.length === 0 && <p className="dashboard-empty">No requirements in this view.</p>}
        {visibleGroups.map(group => {
          const rows = requirements.filter(item =>
            (group.id === "all" || item.group === group.id) &&
            (!actionOnly || item.group !== "recent"),
          );
          if (reverseOrder) rows.reverse();
          const open = !closedGroups.includes(group.id);
          return (
            <section className="dashboard-group" key={group.id} aria-labelledby={`${group.id}-heading`}>
              <h2 id={`${group.id}-heading`}>
                <button type="button" aria-expanded={open}
                  onClick={() => setClosedGroups(current => open ? [...current, group.id] : current.filter(id => id !== group.id))}>
                  <ChevronDown size={15} className={open ? "" : "is-closed"} aria-hidden="true" />
                  {group.title}<span className="dashboard-group-count">{rows.length}</span>
                </button>
              </h2>
              {open && <div className="dashboard-rows">{rows.map(item => (
                <div className="dashboard-item" key={item.id}>
                  <button type="button" className={`dashboard-row${selected === item.id ? " is-active" : ""}`}
                    aria-expanded={selected === item.id}
                    aria-controls={selected === item.id ? `thread-${item.id}` : undefined}
                    onClick={() => setSelected(current => current === item.id ? null : item.id)}>
                    <span className={`dashboard-status-dot ${item.group}`} aria-hidden="true" />
                    <span className="dashboard-id">{item.id}</span>
                    <span className="dashboard-title">{item.title}</span>
                    <EvidenceProgress steps={item.steps} />
                    <span className="dashboard-summary">{item.summary}</span>
                    <span className="dashboard-project">{item.project}</span>
                    <span className="dashboard-date">{item.updated}</span>
                  </button>
                  {selected === item.id && <EvidencePreview requirement={item} />}
                </div>
              ))}</div>}
            </section>
          );
        })}
      </div>
    </section>
  );
}
