START TRANSACTION;
ALTER TABLE public.requirement_evidence DROP CONSTRAINT ck_requirement_evidence_checks;

ALTER TABLE public.requirement_evidence DROP CONSTRAINT ck_requirement_evidence_source;

ALTER TABLE public.requirement_evidence DROP COLUMN check_count;

ALTER TABLE public.requirement_evidence DROP COLUMN checks;

ALTER TABLE public.requirement_evidence DROP COLUMN checks_read_at;

ALTER TABLE public.requirement_evidence DROP COLUMN source;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261008084108_EvidenceChecks';

COMMIT;

