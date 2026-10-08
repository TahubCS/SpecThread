START TRANSACTION;
ALTER TABLE public.requirement_evidence DROP CONSTRAINT ck_requirement_evidence_identity;

ALTER TABLE public.requirement_evidence DROP CONSTRAINT ck_requirement_evidence_kind;

ALTER TABLE public.requirement_evidence ADD contains jsonb;

ALTER TABLE public.requirement_evidence ADD merge_sha text;

ALTER TABLE public.requirement_evidence ADD prerelease boolean;

ALTER TABLE public.requirement_evidence ADD tag text;

CREATE UNIQUE INDEX "IX_requirement_evidence_requirement_id_repository_id_tag" ON public.requirement_evidence (requirement_id, repository_id, tag) WHERE kind = 'release';

ALTER TABLE public.requirement_evidence ADD CONSTRAINT ck_requirement_evidence_identity CHECK ((kind = 'commit' AND sha IS NOT NULL AND sha ~ '^[0-9a-f]{40}$' AND number IS NULL AND state IS NULL AND tag IS NULL) OR (kind IN ('issue', 'pull_request') AND number IS NOT NULL AND number > 0 AND state IS NOT NULL AND tag IS NULL) OR (kind = 'release' AND tag IS NOT NULL AND length(btrim(tag)) > 0 AND number IS NULL AND state IS NULL));

ALTER TABLE public.requirement_evidence ADD CONSTRAINT ck_requirement_evidence_kind CHECK (kind IN ('issue', 'pull_request', 'commit', 'release'));

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008090129_EvidenceReleases', '10.0.12');

COMMIT;

