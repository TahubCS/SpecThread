// One-time initial migration generator. Never connects to a database.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { getAuthTables } from "better-auth/db";
import { jwt } from "better-auth/plugins";

const env = {
  ...process.env,
  DOTNET_ENVIRONMENT: "Production",
  ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder",
};
const run = (args) => execFileSync("dotnet", args, { env, stdio: "inherit" });
const dir = "app/api/Migrations";
run(["ef", "migrations", "add", "InitialSchema", "--project", "app/api"]);
const file = `${dir}/${readdirSync(dir).find(name => name.endsWith("_InitialSchema.cs"))}`;
const source = readFileSync(file, "utf8");
const position = source.lastIndexOf("        }", source.indexOf("protected override void Down"));
if (position < 0) throw new Error("Unexpected EF migration scaffold format");
const tables = ["user", "session", "account", "verification", "jwks", "projects", "project_members", "requirements", "acceptance_criteria"];
// RLS is not expressible in EF's relational model. Include this explicit security
// section in the generated migration, in the same transaction as table creation.
const sql = tables.map(table => `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON TABLE public."${table}" FROM PUBLIC;`).join("\n");
const revoke = `DO $security$\nBEGIN\n  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN\n    REVOKE ALL ON TABLE ${tables.map(t => `public."${t}"`).join(", ")} FROM anon;\n  END IF;\n  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN\n    REVOKE ALL ON TABLE ${tables.map(t => `public."${t}"`).join(", ")} FROM authenticated;\n  END IF;\nEND $security$;`;
const security = `            migrationBuilder.Sql("""\n${(sql + "\n" + revoke).split("\n").map(line => "                " + line).join("\n")}\n                """);\n`;
writeFileSync(file, source.slice(0, position) + security + source.slice(position));
mkdirSync("docs/schema", { recursive: true });
writeFileSync("docs/schema/better-auth-1.7.5.json", JSON.stringify(getAuthTables({ plugins: [jwt()] }), null, 2) + "\n");
run(["ef", "migrations", "script", "0", "InitialSchema", "--project", "app/api", "--output", "docs/schema/initial.sql"]);
run(["ef", "migrations", "script", "InitialSchema", "0", "--project", "app/api", "--output", "docs/schema/rollback.sql"]);
