START TRANSACTION;
DROP TABLE public.requirement_events;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261128072910_RequirementEvents';

COMMIT;

