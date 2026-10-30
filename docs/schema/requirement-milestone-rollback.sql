START TRANSACTION;
ALTER TABLE public.requirements DROP CONSTRAINT ck_requirements_milestone;

ALTER TABLE public.requirements DROP COLUMN milestone;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261030001226_RequirementMilestone';

COMMIT;

