START TRANSACTION;
DROP TABLE public.requirement_criteria_versions;

ALTER TABLE public.requirement_reviews DROP CONSTRAINT ck_requirement_reviews_criteria_version;

ALTER TABLE public.requirement_reviews DROP COLUMN criteria_version;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261030001133_RequirementCriteriaVersions';

COMMIT;

