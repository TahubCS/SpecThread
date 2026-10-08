// Run after `dotnet ef migrations add TeamInvitations --project app/api`. No database is opened.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const directory = "app/api/Migrations";
const file = `${directory}/${readdirSync(directory).find(name => name.endsWith("_TeamInvitations.cs"))}`;
const source = readFileSync(file, "utf8");
if (!source.includes("ENABLE ROW LEVEL SECURITY")) {
  const position = source.lastIndexOf("        }", source.indexOf("protected override void Down"));
  if (position < 0) throw new Error("Unexpected migration format");
  const security = `            migrationBuilder.Sql("""
                ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public.team_invitations FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public.team_invitations FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public.team_invitations FROM authenticated;
                  END IF;
                END $security$;
                """);
`;
  writeFileSync(file, source.slice(0, position) + security + source.slice(position));
}
const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["TeamProjects", "TeamInvitations", "docs/schema/team-invitations.sql"],
  ["TeamInvitations", "TeamProjects", "docs/schema/team-invitations-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--output", output], { env, stdio: "inherit" });
  writeFileSync(output, readFileSync(output, "utf8").replace(/^\uFEFF/, "").trimEnd() + "\n", "utf8");
}
