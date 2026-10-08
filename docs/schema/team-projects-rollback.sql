START TRANSACTION;
ALTER TABLE public.projects DROP CONSTRAINT "FK_projects_teams_team_id";

DROP INDEX public."IX_projects_team_id";

ALTER TABLE public.projects DROP COLUMN team_id;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261008073250_TeamProjects';

COMMIT;
