START TRANSACTION;
DROP TABLE public.requirement_evidence_events;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261030130820_RequirementEvidenceEvents';

COMMIT;

