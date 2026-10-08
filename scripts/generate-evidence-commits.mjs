// Run after scaffolding EvidenceCommits with EF. No database connection is opened.
// The migration only alters requirement_evidence, whose RLS and grants are already in place.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

// Rolling back restores "every row has a number and a state", which commit links cannot satisfy,
// so the rollback removes them first. EF cannot infer that, so it is added to the migration here.
const directory = "app/api/Migrations";
const file = `${directory}/${readdirSync(directory).find(name => name.endsWith("_EvidenceCommits.cs"))}`;
const source = readFileSync(file, "utf8");
if (!source.includes("DELETE FROM public.requirement_evidence")) {
  const marker = "protected override void Down(MigrationBuilder migrationBuilder)";
  const position = source.indexOf("{", source.indexOf(marker)) + 1;
  if (position <= 0) throw new Error("Unexpected migration format");
  const removal = `
            migrationBuilder.Sql("DELETE FROM public.requirement_evidence WHERE kind = 'commit';");
`;
  writeFileSync(file, source.slice(0, position) + removal + source.slice(position));
}

const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["RequirementEvidence", "EvidenceCommits", "docs/schema/evidence-commits.sql"],
  ["EvidenceCommits", "RequirementEvidence", "docs/schema/evidence-commits-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--configuration", "Release", "--output", output], { env, stdio: "inherit" });
  writeFileSync(output, readFileSync(output, "utf8").replace(/^﻿/, ""), "utf8");
}
