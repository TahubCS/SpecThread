import { expect, test } from "@playwright/test";
import { inflateSync } from "node:zlib";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, PDFString } from "pdf-lib";
import {
  buildExportPdf, exportDecisionText, exportEvidenceText, exportFileName, parseProjectExport, type ProjectExport,
} from "../../app/web/src/lib/project-export";

// The PDF export (ADR-068, US-22), built and read back without a browser.

const base = "https://specthread.example";
const data: ProjectExport = {
  projectId: "p1", projectName: "Checkout", milestone: "Sprint 3", generatedAt: "2026-11-28T10:30:00Z",
  requirements: [
    { id: "r1", title: "Guest pays", milestone: "Sprint 3", criteriaVersion: 2, acceptanceCriteria: ["Pay without an account", "Receipt is emailed"],
      evidenceComplete: true, evidenceMissing: [],
      latestDecision: { decision: "accepted", note: "Looks right.", reviewerName: "Robert Client", decidedAt: "2026-11-20T09:00:00Z", outdated: false, criteriaChanged: false } },
    { id: "r2", title: "Order ships", milestone: "Sprint 3", criteriaVersion: 1, acceptanceCriteria: ["Label prints"],
      evidenceComplete: false, evidenceMissing: ["passing_checks", "release"], latestDecision: null },
  ],
};

/** Every text string drawn on each page, read back from the PDF's content streams. */
async function readPdf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages().map(page => {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map(ref => doc.context.lookup(ref)) : [contents];
    const text = streams.map(stream => {
      const raw = stream as PDFRawStream;
      const encoded = Buffer.from(raw.contents);
      const filter = (stream as PDFStream).dict.get(PDFName.of("Filter"));
      return (filter ? inflateSync(encoded) : encoded).toString("latin1");
    }).join("\n");
    const strings = [...text.matchAll(/<([0-9A-Fa-f]*)> Tj/g)].map(match => Buffer.from(match[1], "hex").toString("latin1"));
    const annots = page.node.Annots();
    const links = (annots ? annots.asArray() : []).map(ref => {
      const action = (doc.context.lookup(ref) as PDFDict).get(PDFName.of("A")) as PDFDict;
      return (action.get(PDFName.of("URI")) as PDFString).decodeText();
    });
    return { strings, links };
  });
  return { doc, pages };
}

test("the PDF has each requirement's title, criteria, evidence status, and latest decision, with links back to SpecThread", async () => {
  const bytes = await buildExportPdf(data, base);
  expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  const { doc, pages } = await readPdf(bytes);
  expect(doc.getTitle()).toBe("Checkout: requirements export");
  expect(pages).toHaveLength(1);
  const text = pages[0].strings.join("\n");
  for (const expected of [
    "Checkout: requirements export", "Milestone or sprint: Sprint 3", "1. Guest pays", "Acceptance criteria (version 2)",
    "1. Pay without an account", "2. Receipt is emailed", "Evidence: Evidence complete",
    "Latest decision: Accepted by Robert Client on Nov 20, 2026", "Note: Looks right.", "2. Order ships",
    "Evidence: Evidence incomplete: missing passing checks, a release that includes it", "Latest decision: Not reviewed yet",
    "Checkout · Page 1 of 1",
  ]) expect(text, expected).toContain(expected);
  // The only mention of proof is the note that neither label means it.
  expect(text).not.toMatch(/verified/i);
  expect(text.match(/proven/gi)).toHaveLength(1);
  expect(pages[0].links).toEqual(expect.arrayContaining([
    `${base}/projects/p1`, `${base}/projects/p1/requirements/r1`, `${base}/projects/p1/requirements/r2`,
  ]));
});

test("long exports wrap and continue on more pages, and characters the font can't draw print as ?", async () => {
  const long = "Word ".repeat(120).trim();
  const many: ProjectExport = {
    ...data, milestone: null,
    requirements: Array.from({ length: 30 }, (_, index) => ({
      ...data.requirements[1], id: `r${index}`, title: index === 0 ? "Emoji 🚀 and Ωmega" : `Requirement ${index}`,
      acceptanceCriteria: index === 0 ? [long, "x".repeat(400)] : ["One"],
    })),
  };
  const { pages } = await readPdf(await buildExportPdf(many, base));
  expect(pages.length).toBeGreaterThan(2);
  const all = pages.flatMap(page => page.strings);
  expect(all).toContain("All active requirements");
  expect(all.some(line => line.startsWith("1. Emoji ? and ?mega"))).toBe(true);
  // Every line fits the page: no drawn line holds the whole 120-word criterion or the 400-character word.
  expect(all.every(line => line.length < 140)).toBe(true);
  expect(pages.at(-1)!.strings.at(-1)).toBe(`Checkout · Page ${pages.length} of ${pages.length}`);
  expect(pages.flatMap(page => page.links).filter(link => link.endsWith("/requirements/r29")).length).toBeGreaterThan(0);

  const empty = await readPdf(await buildExportPdf({ ...data, requirements: [] }, base));
  expect(empty.pages[0].strings).toContain("No active requirements are in Sprint 3.");
});

test("the export is parsed only in the documented shape, and its words and file name read plainly", () => {
  expect(parseProjectExport(JSON.parse(JSON.stringify(data)))).toEqual(data);
  const requirement = data.requirements[0];
  for (const value of [null, {}, { ...data, generatedAt: "soon" }, { ...data, requirements: {} },
    { ...data, requirements: [{ ...requirement, acceptanceCriteria: [1] }] },
    { ...data, requirements: [{ ...requirement, evidenceComplete: true, evidenceMissing: ["issue"] }] },
    { ...data, requirements: [{ ...requirement, evidenceMissing: ["proof"] }] },
    { ...data, requirements: [{ ...requirement, latestDecision: { ...requirement.latestDecision, decision: "verified" } }] },
    { ...data, requirements: [{ ...requirement, latestDecision: { ...requirement.latestDecision, reviewerName: null } }] }]) {
    expect(() => parseProjectExport(value), JSON.stringify(value)).toThrow("unexpected export");
  }
  expect(exportEvidenceText({ evidenceComplete: false, evidenceMissing: [] })).toBe("Evidence status not available");
  expect(exportDecisionText({ ...requirement.latestDecision!, outdated: true }))
    .toBe("Accepted by Robert Client on Nov 20, 2026 (the requirement or its evidence changed since, so it needs a new review)");
  expect(exportDecisionText({ ...requirement.latestDecision!, decision: "more_evidence", criteriaChanged: true, outdated: true }))
    .toBe("More evidence requested by Robert Client on Nov 20, 2026 (the acceptance criteria changed since, so it needs a new review)");
  expect(exportFileName(data)).toBe("checkout-sprint-3-2026-11-28.pdf");
  expect(exportFileName({ ...data, projectName: "Café Ünïcode!", milestone: null })).toBe("cafe-unicode-all-2026-11-28.pdf");
  expect(exportFileName({ ...data, projectName: "🚀", milestone: "✓" })).toBe("project-milestone-2026-11-28.pdf");
});
