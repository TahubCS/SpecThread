START TRANSACTION;
DROP TABLE public.team_members;

DROP TABLE public.teams;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261008055721_Teams';

COMMIT;
