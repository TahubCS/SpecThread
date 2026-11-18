// Run after dotnet ef migrations add TeamReviewerObserverRoles --project app/api. No database connection is opened.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const directory = "app/api/Migrations";
const file = `${directory}/${readdirSync(directory).find(name => name.endsWith("_TeamReviewerObserverRoles.cs"))}`;
let source = readFileSync(file, "utf8");
if (!source.includes("DELETE FROM public.team_members")) {
  // The earlier checks allow only admin and member. Turning a Reviewer or Observer into a Member
  // would let them edit, so rolling back removes those memberships and invitations instead
  // (ADR-058). An Owner's own row keeps the team, as a Member row.
  const down = source.indexOf("protected override void Down");
  const check = source.indexOf("migrationBuilder.AddCheckConstraint(", down);
  if (check < 0) throw new Error("Unexpected migration format");
  const narrow = `migrationBuilder.Sql("""
                UPDATE public.team_members m SET role = 'member' FROM public.teams t
                  WHERE m.team_id = t.id AND m.user_id = t.owner_user_id AND m.role IN ('reviewer', 'observer');
                DELETE FROM public.team_members WHERE role IN ('reviewer', 'observer');
                DELETE FROM public.team_invitations WHERE role IN ('reviewer', 'observer');
                """);

            `;
  source = source.slice(0, check) + narrow + source.slice(check);
  writeFileSync(file, source);
}
const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["RequirementEvidenceSuggestions", "TeamReviewerObserverRoles", "docs/schema/team-reviewer-observer-roles.sql"],
  ["TeamReviewerObserverRoles", "RequirementEvidenceSuggestions", "docs/schema/team-reviewer-observer-roles-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--configuration", "Release", "--output", output], { env, stdio: "inherit" });
  writeFileSync(output, readFileSync(output, "utf8").replace(/^﻿/, ""), "utf8");
}
