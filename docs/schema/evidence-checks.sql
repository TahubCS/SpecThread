START TRANSACTION;
ALTER TABLE public.requirement_evidence ADD check_count integer;

ALTER TABLE public.requirement_evidence ADD checks jsonb;

ALTER TABLE public.requirement_evidence ADD checks_read_at timestamp with time zone;

ALTER TABLE public.requirement_evidence ADD source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.requirement_evidence ADD CONSTRAINT ck_requirement_evidence_checks CHECK (COALESCE(check_count, 0) >= 0);

ALTER TABLE public.requirement_evidence ADD CONSTRAINT ck_requirement_evidence_source CHECK (source IN ('manual', 'suggested'));

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008084108_EvidenceChecks', '10.0.12');

COMMIT;

