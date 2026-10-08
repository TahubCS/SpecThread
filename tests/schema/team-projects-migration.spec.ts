import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startTestDatabase } from "../../scripts/test-database.mjs";

test("legacy projects become separate teams without changing collaborators or requirement data", async () => {
  test.setTimeout(180_000);
  const database = await startTestDatabase();
  try {
    const sql = async (path: string) => database.pool.query(await readFile(path, "utf8"));
    await sql("docs/schema/team-projects-rollback.sql");
    await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES
      ('owner','Owner','owner@example.invalid',true,now(),now()),
      ('alice','Alice','alice@example.invalid',true,now(),now()),
      ('bob','Bob','bob@example.invalid',true,now(),now());
      INSERT INTO teams(name,description,owner_user_id) VALUES ('Existing team','Keep this','owner');`);
    const projects = (await database.pool.query(`INSERT INTO projects(name,owner_user_id,created_at,archived_at) VALUES
      ('First project','owner','2025-01-01',null),('Second project','owner','2025-02-01','2025-03-01') RETURNING id,name,created_at,archived_at`)).rows;
    const first = projects.find(p => p.name === "First project");
    const second = projects.find(p => p.name === "Second project");
    await database.pool.query("INSERT INTO project_members(project_id,user_id,joined_at) VALUES ($1,'alice','2025-01-02'),($2,'owner','2025-02-01'),($2,'bob','2025-02-02')", [first.id, second.id]);
    const requirement = (await database.pool.query("INSERT INTO requirements(project_id,title,description,created_by) VALUES ($1,'Preserve me','Details','alice') RETURNING id", [first.id])).rows[0];
    await database.pool.query("INSERT INTO acceptance_criteria(requirement_id,text,position) VALUES ($1,'Keep the criterion',0)", [requirement.id]);
    const legacyMembers = (await database.pool.query("SELECT * FROM project_members ORDER BY project_id,user_id")).rows;
    await sql("docs/schema/team-projects.sql");
    const linked = (await database.pool.query("SELECT id,team_id,name,created_at,archived_at FROM projects ORDER BY name")).rows;
    expect(linked).toEqual(projects.sort((a, b) => a.name.localeCompare(b.name)).map(p => expect.objectContaining(p)));
    expect(new Set(linked.map(p => p.team_id)).size).toBe(2);
    const memberships = (await database.pool.query(`SELECT p.name,m.user_id,m.role,m.joined_at FROM projects p JOIN team_members m ON m.team_id=p.team_id ORDER BY p.name,m.user_id`)).rows;
    expect(memberships.map(m => [m.name,m.user_id,m.role])).toEqual([
      ["First project","alice","member"], ["First project","owner","member"],
      ["Second project","bob","member"], ["Second project","owner","member"],
    ]);
    expect(memberships[0].joined_at.toISOString()).toBe("2025-01-02T00:00:00.000Z");
    expect((await database.pool.query("SELECT p.name,t.name AS team_name,t.owner_user_id FROM projects p JOIN teams t ON t.id=p.team_id ORDER BY p.name")).rows).toEqual([
      { name: "First project", team_name: "First project", owner_user_id: "owner" },
      { name: "Second project", team_name: "Second project", owner_user_id: "owner" },
    ]);
    expect((await database.pool.query("SELECT * FROM project_members ORDER BY project_id,user_id")).rows).toEqual(legacyMembers);
    expect((await database.pool.query("SELECT user_id FROM user_onboarding ORDER BY user_id")).rows).toEqual([{ user_id: "alice" }, { user_id: "bob" }, { user_id: "owner" }]);
    expect((await database.pool.query("SELECT name,description FROM teams WHERE name='Existing team'")).rows).toEqual([{ name: "Existing team", description: "Keep this" }]);
    expect((await database.pool.query("SELECT is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='team_id'")).rows[0]).toEqual({ is_nullable: "NO", column_default: null });
    await expect(database.pool.query("INSERT INTO projects(name,owner_user_id) VALUES ('No team','owner')")).rejects.toThrow();
    await sql("docs/schema/team-projects-rollback.sql");
    expect((await database.pool.query("SELECT count(*)::int AS count FROM projects")).rows[0].count).toBe(2);
    expect((await database.pool.query("SELECT count(*)::int AS count FROM teams")).rows[0].count).toBe(3);
    expect((await database.pool.query("SELECT title,description,created_by FROM requirements")).rows).toEqual([{ title: "Preserve me", description: "Details", created_by: "alice" }]);
    expect((await database.pool.query("SELECT text,position FROM acceptance_criteria")).rows).toEqual([{ text: "Keep the criterion", position: 0 }]);
    await sql("docs/schema/team-projects.sql");
    expect((await database.pool.query("SELECT count(*)::int AS count FROM projects p JOIN teams t ON t.id=p.team_id")).rows[0].count).toBe(2);
  } finally { await database.stop(); }
});
