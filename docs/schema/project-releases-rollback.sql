START TRANSACTION;
DROP TABLE public.project_releases;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261128074702_ProjectReleases';

COMMIT;

