import { PDFDocument, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { EVIDENCE_PARTS, type EvidencePart } from "./projects";
import { DECISIONS, decisionText, type Decision } from "./reviews";

/** A requirement's latest decision as exported: the reviewer's name, not an ID, so the PDF reads on its own. */
export type ExportDecision = {
  decision: Decision; note: string; reviewerName: string; decidedAt: string; outdated: boolean; criteriaChanged: boolean;
};

/** One requirement in an export (docs/API.md): title, criteria, Evidence complete status, and latest decision. */
export type ExportRequirement = {
  id: string; title: string; milestone: string | null; criteriaVersion: number | null; acceptanceCriteria: string[];
  evidenceComplete: boolean; evidenceMissing: EvidencePart[]; latestDecision: ExportDecision | null;
};

/** A project's export (ADR-068): its active requirements, or one milestone's. */
export type ProjectExport = {
  projectId: string; projectName: string; milestone: string | null; generatedAt: string; requirements: ExportRequirement[];
};

const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

function fail(): never {
  throw new Error("The API returned an unexpected export.");
}

/** Validates a project export from an API response. Throws when the shape is not the documented one. */
export function parseProjectExport(value: unknown): ProjectExport {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.projectId !== "string" || typeof item.projectName !== "string" ||
      (item.milestone !== null && typeof item.milestone !== "string") || !isDate(item.generatedAt) || !Array.isArray(item.requirements)) fail();
  return {
    projectId: item.projectId, projectName: item.projectName, milestone: item.milestone, generatedAt: item.generatedAt,
    requirements: item.requirements.map((entry: unknown) => {
      const requirement = entry as Record<string, unknown> | null;
      if (typeof requirement !== "object" || requirement === null || typeof requirement.id !== "string" || typeof requirement.title !== "string" ||
          (requirement.milestone !== null && typeof requirement.milestone !== "string") ||
          (requirement.criteriaVersion !== null && (typeof requirement.criteriaVersion !== "number" || !Number.isInteger(requirement.criteriaVersion))) ||
          !Array.isArray(requirement.acceptanceCriteria) || !requirement.acceptanceCriteria.every(text => typeof text === "string") ||
          typeof requirement.evidenceComplete !== "boolean" || !Array.isArray(requirement.evidenceMissing) ||
          !requirement.evidenceMissing.every(part => (EVIDENCE_PARTS as readonly unknown[]).includes(part)) ||
          requirement.evidenceComplete !== (requirement.evidenceMissing.length === 0)) fail();
      const decision = requirement.latestDecision as Record<string, unknown> | null;
      if (decision !== null && (typeof decision !== "object" || !DECISIONS.includes(decision.decision as Decision) ||
          typeof decision.note !== "string" || typeof decision.reviewerName !== "string" || !isDate(decision.decidedAt) ||
          typeof decision.outdated !== "boolean" || typeof decision.criteriaChanged !== "boolean")) fail();
      return {
        id: requirement.id, title: requirement.title, milestone: requirement.milestone, criteriaVersion: requirement.criteriaVersion,
        acceptanceCriteria: requirement.acceptanceCriteria as string[], evidenceComplete: requirement.evidenceComplete,
        evidenceMissing: EVIDENCE_PARTS.filter(part => (requirement.evidenceMissing as unknown[]).includes(part)),
        latestDecision: decision === null ? null : {
          decision: decision.decision as Decision, note: decision.note as string, reviewerName: decision.reviewerName as string,
          decidedAt: decision.decidedAt as string, outdated: decision.outdated as boolean, criteriaChanged: decision.criteriaChanged as boolean,
        },
      };
    }),
  };
}

const MISSING_TEXT: Record<EvidencePart, string> = {
  issue: "a linked issue", merged_pull_request: "a merged pull request", passing_checks: "passing checks", release: "a release that includes it",
};

const day = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const dayTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** Says a requirement's evidence status in words, as the export prints it. */
export function exportEvidenceText(requirement: Pick<ExportRequirement, "evidenceComplete" | "evidenceMissing">): string {
  if (requirement.evidenceComplete) return "Evidence complete";
  if (requirement.evidenceMissing.length === 0) return "Evidence status not available";
  return `Evidence incomplete: missing ${requirement.evidenceMissing.map(part => MISSING_TEXT[part]).join(", ")}`;
}

/** Says a requirement's latest decision with the reviewer and date, as the export prints it. */
export function exportDecisionText(decision: ExportDecision | null): string {
  if (!decision) return "Not reviewed yet";
  const text = `${decisionText[decision.decision]} by ${decision.reviewerName} on ${day.format(new Date(decision.decidedAt))}`;
  if (decision.criteriaChanged) return `${text} (the acceptance criteria changed since, so it needs a new review)`;
  if (decision.outdated) return `${text} (the requirement or its evidence changed since, so it needs a new review)`;
  return text;
}

/** A file name for the export, such as "checkout-sprint-3-2026-11-28.pdf". */
export function exportFileName(data: Pick<ProjectExport, "projectName" | "milestone" | "generatedAt">): string {
  const slug = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const parts = [slug(data.projectName) || "project", data.milestone ? slug(data.milestone) || "milestone" : "all", data.generatedAt.slice(0, 10)];
  return `${parts.join("-")}.pdf`;
}

const PAGE = { width: 612, height: 792, margin: 54 } as const;
const ink = rgb(0.1, 0.1, 0.1);
const muted = rgb(0.38, 0.38, 0.38);
const linkBlue = rgb(0.06, 0.32, 0.73);

/**
 * Builds the export as a PDF (ADR-068, US-22): a heading with the project, the milestone or "All
 * active requirements", and when it was made; a short note on what the labels mean; then each
 * requirement with its title linking back to SpecThread, its acceptance criteria, its evidence
 * status, and its latest decision with reviewer, date, and note. `baseUrl` is SpecThread's
 * address, such as "https://specthread.example". The standard PDF fonts can't draw every
 * character; any they can't is printed as "?".
 */
export async function buildExportPdf(data: ProjectExport, baseUrl: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${data.projectName}: requirements export`);
  doc.setCreator("SpecThread");
  doc.setProducer("SpecThread");
  doc.setCreationDate(new Date(data.generatedAt));
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const projectUrl = `${baseUrl}/projects/${data.projectId}`;
  const width = PAGE.width - PAGE.margin * 2;
  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;

  const newPage = () => {
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - PAGE.margin;
  };
  const ensure = (height: number) => {
    if (y - height < PAGE.margin + 24) newPage();
  };
  /** Draws wrapped text, moving to a new page as needed; returns the boxes of each line for links. */
  const write = (text: string, { font = fonts.regular, size = 10.5, color = ink, indent = 0, gap = 4, url = null as string | null } = {}) => {
    const lineHeight = size * 1.35;
    for (const line of wrap(safe(text, font), font, size, width - indent)) {
      ensure(lineHeight);
      y -= lineHeight;
      page.drawText(line, { x: PAGE.margin + indent, y: y + (lineHeight - size) / 2, size, font, color });
      if (url) addLink(page, url, PAGE.margin + indent, y, font.widthOfTextAtSize(line, size), lineHeight);
    }
    y -= gap;
  };

  write(`${data.projectName}: requirements export`, { font: fonts.bold, size: 18, gap: 6 });
  write(data.milestone ? `Milestone or sprint: ${data.milestone}` : "All active requirements", { size: 11.5, gap: 2 });
  write(`${data.requirements.length === 1 ? "1 requirement" : `${data.requirements.length} requirements`}, exported from SpecThread on ${dayTime.format(new Date(data.generatedAt))} UTC.`,
    { color: muted, gap: 2 });
  write(`Open the project in SpecThread: ${projectUrl}`, { color: linkBlue, url: projectUrl, gap: 8 });
  write("Evidence complete means the team's evidence rule is met: a linked issue, a merged pull request whose automated checks passed, " +
    "and a release that includes it. Accepted means a person reviewed the evidence and approved the requirement. Neither means the " +
    "software is proven correct.", { size: 9.5, color: muted, gap: 14 });

  if (data.requirements.length === 0) {
    write(data.milestone ? `No active requirements are in ${data.milestone}.` : "This project has no active requirements.");
  }
  data.requirements.forEach((requirement, index) => {
    const url = `${baseUrl}/projects/${data.projectId}/requirements/${requirement.id}`;
    ensure(80);
    if (index > 0) {
      page.drawLine({ start: { x: PAGE.margin, y: y + 6 }, end: { x: PAGE.width - PAGE.margin, y: y + 6 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
      y -= 8;
    }
    write(`${index + 1}. ${requirement.title}`, { font: fonts.bold, size: 13, color: linkBlue, url, gap: 2 });
    if (requirement.milestone) write(`Milestone or sprint: ${requirement.milestone}`, { size: 9.5, color: muted, gap: 4 });
    write(requirement.criteriaVersion === null ? "Acceptance criteria" : `Acceptance criteria (version ${requirement.criteriaVersion})`,
      { font: fonts.bold, size: 10.5, gap: 2 });
    if (requirement.acceptanceCriteria.length === 0) write("No acceptance criteria.", { color: muted, indent: 12 });
    requirement.acceptanceCriteria.forEach((criterion, number) => write(`${number + 1}. ${criterion}`, { indent: 12, gap: 2 }));
    y -= 4;
    write(`Evidence: ${exportEvidenceText(requirement)}`, { gap: 2 });
    write(`Latest decision: ${exportDecisionText(requirement.latestDecision)}`, { gap: 2 });
    if (requirement.latestDecision?.note) write(`Note: ${requirement.latestDecision.note}`, { font: fonts.italic, color: muted, indent: 12, gap: 2 });
    write(`Evidence and history: ${url}`, { size: 9, color: linkBlue, url, gap: 14 });
  });

  const pages = doc.getPages();
  pages.forEach((each, index) => {
    const footer = safe(`${data.projectName} · Page ${index + 1} of ${pages.length}`, fonts.regular);
    each.drawText(footer, { x: PAGE.margin, y: PAGE.margin / 2, size: 8.5, font: fonts.regular, color: muted });
  });
  return doc.save();
}

/** Adds a clickable area that opens `url`, over text already drawn. */
function addLink(page: PDFPage, url: string, x: number, y: number, width: number, height: number) {
  const context = page.doc.context;
  const annotation = context.register(context.obj({
    Type: "Annot", Subtype: "Link", Rect: [x, y, x + width, y + height], Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
  }));
  page.node.addAnnot(annotation);
}

const drawable = new WeakMap<PDFFont, Map<string, boolean>>();

/** Replaces characters the font can't draw with "?", and line breaks and tabs with spaces. */
function safe(text: string, font: PDFFont): string {
  let known = drawable.get(font);
  if (!known) drawable.set(font, known = new Map());
  let result = "";
  for (const character of text.replace(/[\r\n\t]+/g, " ")) {
    let ok = known.get(character);
    if (ok === undefined) {
      try {
        font.encodeText(character);
        ok = true;
      } catch {
        ok = false;
      }
      known.set(character, ok);
    }
    result += ok ? character : "?";
  }
  return result;
}

/** Splits text into lines that fit `width`, breaking between words, and inside a word only when it alone is too long. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const fits = (value: string) => font.widthOfTextAtSize(value, size) <= width;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate)) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    while (!fits(line)) {
      let cut = line.length - 1;
      while (cut > 1 && !fits(line.slice(0, cut))) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}
