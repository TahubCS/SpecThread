// Run after dotnet ef migrations add RequirementUpdatedBy --project app/api. No database connection is opened.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const directory = "app/api/Migrations";
const file = `${directory}/${readdirSync(directory).find(name => name.endsWith("_RequirementUpdatedBy.cs"))}`;
const source = readFileSync(file, "utf8");
if (!source.includes("SET updated_by = created_by")) {
  const position = source.indexOf("            migrationBuilder.CreateIndex(");
  if (position < 0) throw new Error("Unexpected migration format");
  // Until now only the creator is known, so existing requirements start with them as last editor.
  const backfill = `            migrationBuilder.Sql("""
                UPDATE public.requirements SET updated_by = created_by WHERE updated_by IS NULL;
                """);

`;
  writeFileSync(file, source.slice(0, position) + backfill + source.slice(position));
}
const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["RequirementDocuments", "RequirementUpdatedBy", "docs/schema/requirement-updated-by.sql"],
  ["RequirementUpdatedBy", "RequirementDocuments", "docs/schema/requirement-updated-by-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--configuration", "Release", "--output", output], { env, stdio: "inherit" });
  writeFileSync(output, readFileSync(output, "utf8").replace(/^﻿/, ""), "utf8");
}
