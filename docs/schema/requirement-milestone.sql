START TRANSACTION;
ALTER TABLE public.requirements ADD milestone character varying(100);

ALTER TABLE public.requirements ADD CONSTRAINT ck_requirements_milestone CHECK (milestone IS NULL OR (btrim(milestone) = milestone AND length(milestone) BETWEEN 1 AND 100));

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261030001226_RequirementMilestone', '10.0.12');

COMMIT;

