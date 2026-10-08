START TRANSACTION;
DELETE FROM public.requirement_evidence WHERE kind = 'commit';

DROP INDEX public."IX_requirement_evidence_requirement_id_repository_id_sha";

ALTER TABLE public.requirement_evidence DROP CONSTRAINT ck_requirement_evidence_changes;

ALTER TABLE public.requirement_evidence DROP CONSTRAINT ck_requirement_evidence_identity;

ALTER TABLE public.requirement_evidence DROP CONSTRAINT ck_requirement_evidence_kind;

ALTER TABLE public.requirement_evidence DROP CONSTRAINT ck_requirement_evidence_repository;

ALTER TABLE public.requirement_evidence DROP CONSTRAINT ck_requirement_evidence_state;

ALTER TABLE public.requirement_evidence DROP COLUMN additions;

ALTER TABLE public.requirement_evidence DROP COLUMN changed_files;

ALTER TABLE public.requirement_evidence DROP COLUMN commit_count;

ALTER TABLE public.requirement_evidence DROP COLUMN commits;

ALTER TABLE public.requirement_evidence DROP COLUMN deletions;

ALTER TABLE public.requirement_evidence DROP COLUMN sha;

UPDATE public.requirement_evidence SET state = '' WHERE state IS NULL;
ALTER TABLE public.requirement_evidence ALTER COLUMN state SET NOT NULL;
ALTER TABLE public.requirement_evidence ALTER COLUMN state SET DEFAULT '';

UPDATE public.requirement_evidence SET number = 0 WHERE number IS NULL;
ALTER TABLE public.requirement_evidence ALTER COLUMN number SET NOT NULL;
ALTER TABLE public.requirement_evidence ALTER COLUMN number SET DEFAULT 0;

ALTER TABLE public.requirement_evidence ADD CONSTRAINT ck_requirement_evidence_kind CHECK (kind IN ('issue', 'pull_request'));

ALTER TABLE public.requirement_evidence ADD CONSTRAINT ck_requirement_evidence_number CHECK (number > 0 AND repository_id > 0);

ALTER TABLE public.requirement_evidence ADD CONSTRAINT ck_requirement_evidence_state CHECK (state IN ('open', 'closed', 'merged'));

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261008082242_EvidenceCommits';

COMMIT;

