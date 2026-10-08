// Run after dotnet ef migrations add TeamProjects --project app/api.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const directory = "app/api/Migrations";
const file = directory + "/" + readdirSync(directory).find(name => name.endsWith("_TeamProjects.cs"));
const source = readFileSync(file, "utf8");
if (!source.includes("UPDATE public.projects SET team_id")) {
  const position = source.indexOf("            migrationBuilder.CreateIndex(");
  if (position < 0) throw new Error("Unexpected migration format");
  const backfill = `            migrationBuilder.Sql("""
                UPDATE public.projects SET team_id = gen_random_uuid();
                INSERT INTO public.teams (id, name, description, owner_user_id, created_at)
                SELECT team_id, left(btrim(name), 200), '', owner_user_id, created_at FROM public.projects;
                INSERT INTO public.team_members (team_id, user_id, role, joined_at)
                SELECT p.team_id, m.user_id, 'member', m.joined_at
                FROM public.projects p JOIN public.project_members m ON m.project_id = p.id;
                INSERT INTO public.team_members (team_id, user_id, role, joined_at)
                SELECT team_id, owner_user_id, 'member', created_at FROM public.projects
                ON CONFLICT (team_id, user_id) DO NOTHING;
                INSERT INTO public.user_onboarding (user_id, completed_at)
                SELECT m.user_id, min(m.joined_at) FROM public.team_members m
                JOIN public.projects p ON p.team_id = m.team_id GROUP BY m.user_id
                ON CONFLICT (user_id) DO NOTHING;
                ALTER TABLE public.projects ALTER COLUMN team_id DROP DEFAULT;
                """);

`;
  writeFileSync(file, source.slice(0, position) + backfill + source.slice(position));
}
const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["TeamNavigationOnboarding", "TeamProjects", "docs/schema/team-projects.sql"],
  ["TeamProjects", "TeamNavigationOnboarding", "docs/schema/team-projects-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--output", output], { env, stdio: "inherit" });
  writeFileSync(output, readFileSync(output, "utf8").replace(/^\uFEFF/, "").trimEnd() + "\n", "utf8");
}
