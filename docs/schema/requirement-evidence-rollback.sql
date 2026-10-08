START TRANSACTION;
DROP TABLE public.requirement_evidence;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261008073621_RequirementEvidence';

COMMIT;

