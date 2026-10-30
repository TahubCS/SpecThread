START TRANSACTION;
ALTER TABLE public.requirement_criteria_versions DROP CONSTRAINT ck_requirement_criteria_versions_criteria;

ALTER TABLE public.requirement_criteria_versions ADD CONSTRAINT ck_requirement_criteria_versions_criteria CHECK (jsonb_typeof(criteria) = 'array');

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261030013056_RequirementCriteriaVersionTexts';

COMMIT;

