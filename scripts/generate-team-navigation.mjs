// Run after dotnet ef migrations add TeamNavigationOnboarding --project app/api.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const directory = "app/api/Migrations";
const file = directory + "/" + readdirSync(directory).find(name => name.endsWith("_TeamNavigationOnboarding.cs"));
const source = readFileSync(file, "utf8");
if (!source.includes("ENABLE ROW LEVEL SECURITY")) {
  const position = source.lastIndexOf("        }", source.indexOf("protected override void Down"));
  if (position < 0) throw new Error("Unexpected migration format");
  const security = '            migrationBuilder.Sql("""\n' +
    '                INSERT INTO public.user_onboarding (user_id, completed_at)\n' +
    '                SELECT user_id, min(joined_at) FROM public.team_members GROUP BY user_id;\n' +
    '                ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;\n' +
    '                REVOKE ALL ON TABLE public.user_onboarding FROM PUBLIC;\n' +
    '                DO $security$\n' +
    '                BEGIN\n' +
    "                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN\n" +
    '                    REVOKE ALL ON TABLE public.user_onboarding FROM anon;\n' +
    '                  END IF;\n' +
    "                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN\n" +
    '                    REVOKE ALL ON TABLE public.user_onboarding FROM authenticated;\n' +
    '                  END IF;\n' +
    '                END $security$;\n' +
    '                """);\n';
  writeFileSync(file, source.slice(0, position) + security + source.slice(position));
}
const env = { ...process.env, ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" };
for (const [from, to, output] of [
  ["Teams", "TeamNavigationOnboarding", "docs/schema/team-navigation.sql"],
  ["TeamNavigationOnboarding", "Teams", "docs/schema/team-navigation-rollback.sql"],
]) {
  execFileSync("dotnet", ["ef", "migrations", "script", from, to, "--project", "app/api", "--output", output], { env, stdio: "inherit" });
  writeFileSync(output, readFileSync(output, "utf8").replace(/^\uFEFF/, "").trimEnd() + "\n", "utf8");
}
