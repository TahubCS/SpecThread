START TRANSACTION;
DROP TABLE public.project_verifications;

DROP TABLE public.verification_runs;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261128092433_ProjectVerification';

COMMIT;

