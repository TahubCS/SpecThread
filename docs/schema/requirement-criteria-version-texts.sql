START TRANSACTION;
ALTER TABLE public.requirement_criteria_versions DROP CONSTRAINT ck_requirement_criteria_versions_criteria;

ALTER TABLE public.requirement_criteria_versions ADD CONSTRAINT ck_requirement_criteria_versions_criteria CHECK (jsonb_typeof(criteria) = 'array' AND NOT jsonb_path_exists(criteria, 'strict $[*] ? (@.type() != "string")'));

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261030013056_RequirementCriteriaVersionTexts', '10.0.12');

COMMIT;

