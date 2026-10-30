// Run after dotnet ef migrations add RequirementMilestone --project app/api. No database connection is opened.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// The migration only adds a nullable column and its check, so EF's output is used as it is.
const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["RequirementCriteriaVersions", "RequirementMilestone", "docs/schema/requirement-milestone.sql"],
  ["RequirementMilestone", "RequirementCriteriaVersions", "docs/schema/requirement-milestone-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--configuration", "Release", "--output", output], { env, stdio: "inherit" });
  writeFileSync(output, readFileSync(output, "utf8").replace(/^﻿/, ""), "utf8");
}
