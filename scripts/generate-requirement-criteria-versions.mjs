// Run after dotnet ef migrations add RequirementCriteriaVersions --project app/api. No database connection is opened.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const directory = "app/api/Migrations";
const file = `${directory}/${readdirSync(directory).find(name => name.endsWith("_RequirementCriteriaVersions.cs"))}`;
const source = readFileSync(file, "utf8");
if (!source.includes("ENABLE ROW LEVEL SECURITY")) {
  const position = source.lastIndexOf("        }", source.indexOf("protected override void Down"));
  if (position < 0) throw new Error("Unexpected migration format");
  // RLS is not expressible in EF's relational model. Existing requirements start at version 1
  // with their current criteria, saved by their last editor when they were last saved; a
  // decision made on the current requirement version saw those criteria (ADR-051).
  const table = "requirement_criteria_versions";
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
                INSERT INTO public.requirement_criteria_versions (requirement_id, number, criteria, created_by, created_at)
                SELECT r.id, 1,
                  COALESCE((SELECT jsonb_agg(c.text ORDER BY c.position) FROM public.acceptance_criteria c WHERE c.requirement_id = r.id), '[]'::jsonb),
                  COALESCE(r.updated_by, r.created_by), r.updated_at
                FROM public.requirements r;
                UPDATE public.requirement_reviews v SET criteria_version = 1
                FROM public.requirements r
                WHERE r.id = v.requirement_id AND v.requirement_version = r.version AND v.criteria_version IS NULL;
                """);
`;
  writeFileSync(file, source.slice(0, position) + sql + source.slice(position));
}
const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["RequirementUpdatedBy", "RequirementCriteriaVersions", "docs/schema/requirement-criteria-versions.sql"],
  ["RequirementCriteriaVersions", "RequirementUpdatedBy", "docs/schema/requirement-criteria-versions-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--configuration", "Release", "--output", output], { env, stdio: "inherit" });
  writeFileSync(output, readFileSync(output, "utf8").replace(/^﻿/, ""), "utf8");
}
