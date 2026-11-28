// Run after dotnet ef migrations add RequirementEvents --project app/api. No database connection is opened.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const directory = "app/api/Migrations";
const file = `${directory}/${readdirSync(directory).find(name => name.endsWith("_RequirementEvents.cs"))}`;
const source = readFileSync(file, "utf8");
if (!source.includes("ENABLE ROW LEVEL SECURITY")) {
  const position = source.lastIndexOf("        }", source.indexOf("protected override void Down"));
  if (position < 0) throw new Error("Unexpected migration format");
  // RLS is not expressible in EF's relational model, so it is added to the migration here. The
  // backfill records what is already known about existing requirements (ADR-065): who created each
  // one and when, and for one edited since, who saved its current version and when. What an
  // earlier edit changed, and who archived a requirement, were never stored, so they are not invented.
  const added = `
            migrationBuilder.Sql("""
                ALTER TABLE public."requirement_events" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."requirement_events" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."requirement_events" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."requirement_events" FROM authenticated;
                  END IF;
                END $security$;
                """);

            migrationBuilder.Sql("""
                INSERT INTO public.requirement_events (requirement_id, action, version, actor, occurred_at)
                SELECT id, 'created', 1, created_by, created_at FROM public.requirements;
                INSERT INTO public.requirement_events (requirement_id, action, version, actor, occurred_at)
                SELECT id, 'edited', version, COALESCE(updated_by, created_by), updated_at FROM public.requirements WHERE version > 1;
                """);
`;
  writeFileSync(file, source.slice(0, position) + added + source.slice(position));
}
const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["RequirementComments", "RequirementEvents", "docs/schema/requirement-events.sql"],
  ["RequirementEvents", "RequirementComments", "docs/schema/requirement-events-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--configuration", "Release", "--output", output], { env, stdio: "inherit" });
  writeFileSync(output, readFileSync(output, "utf8").replace(/^﻿/, ""), "utf8");
}
