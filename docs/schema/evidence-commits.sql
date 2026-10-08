START TRANSACTION;
ALTER TABLE public.requirement_evidence DROP CONSTRAINT ck_requirement_evidence_kind;

ALTER TABLE public.requirement_evidence DROP CONSTRAINT ck_requirement_evidence_number;

ALTER TABLE public.requirement_evidence DROP CONSTRAINT ck_requirement_evidence_state;

ALTER TABLE public.requirement_evidence ALTER COLUMN state DROP NOT NULL;

ALTER TABLE public.requirement_evidence ALTER COLUMN number DROP NOT NULL;

ALTER TABLE public.requirement_evidence ADD additions integer;

ALTER TABLE public.requirement_evidence ADD changed_files integer;

ALTER TABLE public.requirement_evidence ADD commit_count integer;

ALTER TABLE public.requirement_evidence ADD commits jsonb;

ALTER TABLE public.requirement_evidence ADD deletions integer;

ALTER TABLE public.requirement_evidence ADD sha text;

CREATE UNIQUE INDEX "IX_requirement_evidence_requirement_id_repository_id_sha" ON public.requirement_evidence (requirement_id, repository_id, sha) WHERE kind = 'commit';

ALTER TABLE public.requirement_evidence ADD CONSTRAINT ck_requirement_evidence_changes CHECK (COALESCE(additions, 0) >= 0 AND COALESCE(deletions, 0) >= 0 AND COALESCE(changed_files, 0) >= 0 AND COALESCE(commit_count, 0) >= 0);

ALTER TABLE public.requirement_evidence ADD CONSTRAINT ck_requirement_evidence_identity CHECK ((kind = 'commit' AND sha IS NOT NULL AND sha ~ '^[0-9a-f]{40}$' AND number IS NULL AND state IS NULL) OR (kind <> 'commit' AND number IS NOT NULL AND number > 0 AND state IS NOT NULL));

ALTER TABLE public.requirement_evidence ADD CONSTRAINT ck_requirement_evidence_kind CHECK (kind IN ('issue', 'pull_request', 'commit'));

ALTER TABLE public.requirement_evidence ADD CONSTRAINT ck_requirement_evidence_repository CHECK (repository_id > 0);

ALTER TABLE public.requirement_evidence ADD CONSTRAINT ck_requirement_evidence_state CHECK (state IS NULL OR state IN ('open', 'closed', 'merged'));

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008082242_EvidenceCommits', '10.0.12');

COMMIT;

