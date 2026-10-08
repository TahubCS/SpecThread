// Run after `dotnet ef migrations add Teams --project app/api`. No database is opened.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const directory = "app/api/Migrations";
const file = `${directory}/${readdirSync(directory).find(name => name.endsWith("_Teams.cs"))}`;
const source = readFileSync(file, "utf8");
if (!source.includes("ENABLE ROW LEVEL SECURITY")) {
  const position = source.lastIndexOf("        }", source.indexOf("protected override void Down"));
  if (position < 0) throw new Error("Unexpected migration format");
  const security = `            migrationBuilder.Sql("""
                ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public.teams, public.team_members FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public.teams, public.team_members FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public.teams, public.team_members FROM authenticated;
                  END IF;
                END $security$;
                """);
`;
  writeFileSync(file, source.slice(0, position) + security + source.slice(position));
}
const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["AuthRateLimits", "Teams", "docs/schema/teams.sql"],
  ["Teams", "AuthRateLimits", "docs/schema/teams-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--output", output], { env, stdio: "inherit" });
  writeFileSync(output, readFileSync(output, "utf8").replace(/^\uFEFF/, "").trimEnd() + "\n", "utf8");
}
