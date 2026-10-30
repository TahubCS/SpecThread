// Run after dotnet ef migrations add RequirementCriteriaVersionTexts --project app/api. No database connection is opened.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// The migration only replaces one check constraint, so EF's output is used as it is.
const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["RequirementFollowUps", "RequirementCriteriaVersionTexts", "docs/schema/requirement-criteria-version-texts.sql"],
  ["RequirementCriteriaVersionTexts", "RequirementFollowUps", "docs/schema/requirement-criteria-version-texts-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--configuration", "Release", "--output", output], { env, stdio: "inherit" });
  writeFileSync(output, readFileSync(output, "utf8").replace(/^﻿/, ""), "utf8");
}
