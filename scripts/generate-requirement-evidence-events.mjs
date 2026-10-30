// Run after dotnet ef migrations add RequirementEvidenceEvents --project app/api. No database connection is opened.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const directory = "app/api/Migrations";
const file = `${directory}/${readdirSync(directory).find(name => name.endsWith("_RequirementEvidenceEvents.cs"))}`;
const source = readFileSync(file, "utf8");
if (!source.includes("ENABLE ROW LEVEL SECURITY")) {
  const position = source.lastIndexOf("        }", source.indexOf("protected override void Down"));
  if (position < 0) throw new Error("Unexpected migration format");
  // RLS is not expressible in EF's relational model. Every existing link already records who
  // added it and when, so each starts the history with that addition (ADR-054). The label is
  // the one the API shows: #number, the release tag, or the short SHA.
  const table = "requirement_evidence_events";
  const sql = `
            migrationBuilder.Sql("""
                ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."${table}" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."${table}" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."${table}" FROM authenticated;
                  END IF;
                END $security$;
                INSERT INTO public.requirement_evidence_events (requirement_id, evidence_id, action, kind, label, title, actor, occurred_at)
                SELECT e.requirement_id, e.id, 'added', e.kind,
                  CASE WHEN e.number IS NOT NULL THEN '#' || e.number WHEN e.tag IS NOT NULL THEN e.tag ELSE left(e.sha, 7) END,
                  e.title, e.linked_by, e.linked_at
                FROM public.requirement_evidence e;
                """);
`;
  writeFileSync(file, source.slice(0, position) + sql + source.slice(position));
}
const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["RequirementCriteriaVersionTexts", "RequirementEvidenceEvents", "docs/schema/requirement-evidence-events.sql"],
  ["RequirementEvidenceEvents", "RequirementCriteriaVersionTexts", "docs/schema/requirement-evidence-events-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--configuration", "Release", "--output", output], { env, stdio: "inherit" });
  writeFileSync(output, readFileSync(output, "utf8").replace(/^﻿/, ""), "utf8");
}
