START TRANSACTION;
DROP TABLE public.project_repositories;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261008070130_ProjectRepositories';

COMMIT;

