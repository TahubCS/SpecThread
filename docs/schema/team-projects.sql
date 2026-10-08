START TRANSACTION;
ALTER TABLE public.projects ADD team_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

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

CREATE INDEX "IX_projects_team_id" ON public.projects (team_id);

ALTER TABLE public.projects ADD CONSTRAINT "FK_projects_teams_team_id" FOREIGN KEY (team_id) REFERENCES public.teams (id) ON DELETE RESTRICT;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008073250_TeamProjects', '10.0.12');

COMMIT;
