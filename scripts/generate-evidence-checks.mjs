// Run after scaffolding EvidenceChecks with EF. No database connection is opened.
// The migration only adds columns to requirement_evidence, whose RLS and grants are already in place.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["EvidenceCommits", "EvidenceChecks", "docs/schema/evidence-checks.sql"],
  ["EvidenceChecks", "EvidenceCommits", "docs/schema/evidence-checks-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--configuration", "Release", "--output", output], { env, stdio: "inherit" });
  writeFileSync(output, readFileSync(output, "utf8").replace(/^﻿/, ""), "utf8");
}
