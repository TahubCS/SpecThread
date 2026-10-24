START TRANSACTION;
ALTER TABLE public.requirements DROP CONSTRAINT "FK_requirements_user_updated_by";

DROP INDEX public."IX_requirements_updated_by";

ALTER TABLE public.requirements DROP COLUMN updated_by;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261024010934_RequirementUpdatedBy';

COMMIT;

