// Run after scaffolding RequirementDocuments with EF. No database connection is opened.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const directory = "app/api/Migrations";
const file = `${directory}/${readdirSync(directory).find(name => name.endsWith("_RequirementDocuments.cs"))}`;
const source = readFileSync(file, "utf8");
if (!source.includes("ENABLE ROW LEVEL SECURITY")) {
  const position = source.lastIndexOf("        }", source.indexOf("protected override void Down"));
  if (position < 0) throw new Error("Unexpected migration format");
  // RLS is not expressible in EF's relational model, so it is added to the migration here.
  const table = "requirement_documents";
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
  writeFileSync(file, source.slice(0, position) + security + source.slice(position));
}
const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["ProjectDocuments", "RequirementDocuments", "docs/schema/requirement-documents.sql"],
  ["RequirementDocuments", "ProjectDocuments", "docs/schema/requirement-documents-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--configuration", "Release", "--output", output], { env, stdio: "inherit" });
  const content = readFileSync(output, "utf8").replace(/^\uFEFF/, "");
  writeFileSync(output, content, "utf8");
}
