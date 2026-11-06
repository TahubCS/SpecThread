// Run after dotnet ef migrations add RequirementEvidenceSuggestions --project app/api. No database connection is opened.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const directory = "app/api/Migrations";
const file = `${directory}/${readdirSync(directory).find(name => name.endsWith("_RequirementEvidenceSuggestions.cs"))}`;
let source = readFileSync(file, "utf8");
if (!source.includes("ENABLE ROW LEVEL SECURITY")) {
  const position = source.lastIndexOf("        }", source.indexOf("protected override void Down"));
  if (position < 0) throw new Error("Unexpected migration format");
  // RLS is not expressible in EF's relational model, so it is added to the migration here.
  const table = "requirement_evidence_suggestions";
  const security = `
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
                """);
`;
  source = source.slice(0, position) + security + source.slice(position);
  // The earlier check allows only added and removed. A move is one of each and a confirmation
  // an addition, so they stay in the history; a rejection has no earlier form and goes.
  const down = source.indexOf("protected override void Down");
  const check = source.indexOf("migrationBuilder.AddCheckConstraint(", down);
  if (check < 0) throw new Error("Unexpected migration format");
  const keep = `migrationBuilder.Sql("""
                DELETE FROM public.requirement_evidence_events WHERE action = 'rejected';
                UPDATE public.requirement_evidence_events SET action = 'added' WHERE action IN ('confirmed', 'moved_in');
                UPDATE public.requirement_evidence_events SET action = 'removed' WHERE action = 'moved_out';
                """);

            `;
  source = source.slice(0, check) + keep + source.slice(check);
  writeFileSync(file, source);
}
const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["RequirementEvidenceEvents", "RequirementEvidenceSuggestions", "docs/schema/requirement-evidence-suggestions.sql"],
  ["RequirementEvidenceSuggestions", "RequirementEvidenceEvents", "docs/schema/requirement-evidence-suggestions-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--configuration", "Release", "--output", output], { env, stdio: "inherit" });
  writeFileSync(output, readFileSync(output, "utf8").replace(/^﻿/, ""), "utf8");
}
