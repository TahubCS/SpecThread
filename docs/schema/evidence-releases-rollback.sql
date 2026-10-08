START TRANSACTION;
DELETE FROM public.requirement_evidence WHERE kind = 'release';

DROP INDEX public."IX_requirement_evidence_requirement_id_repository_id_tag";

ALTER TABLE public.requirement_evidence DROP CONSTRAINT ck_requirement_evidence_identity;

ALTER TABLE public.requirement_evidence DROP CONSTRAINT ck_requirement_evidence_kind;

ALTER TABLE public.requirement_evidence DROP COLUMN contains;

ALTER TABLE public.requirement_evidence DROP COLUMN merge_sha;

ALTER TABLE public.requirement_evidence DROP COLUMN prerelease;

ALTER TABLE public.requirement_evidence DROP COLUMN tag;

ALTER TABLE public.requirement_evidence ADD CONSTRAINT ck_requirement_evidence_identity CHECK ((kind = 'commit' AND sha IS NOT NULL AND sha ~ '^[0-9a-f]{40}$' AND number IS NULL AND state IS NULL) OR (kind <> 'commit' AND number IS NOT NULL AND number > 0 AND state IS NOT NULL));

ALTER TABLE public.requirement_evidence ADD CONSTRAINT ck_requirement_evidence_kind CHECK (kind IN ('issue', 'pull_request', 'commit'));

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261008090129_EvidenceReleases';

COMMIT;

