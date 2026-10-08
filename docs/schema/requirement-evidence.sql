START TRANSACTION;
CREATE TABLE public.requirement_evidence (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    requirement_id uuid NOT NULL,
    kind text NOT NULL,
    repository_id bigint NOT NULL,
    repository_owner text NOT NULL,
    repository_name text NOT NULL,
    number integer NOT NULL,
    title text NOT NULL,
    state text NOT NULL,
    author text,
    url text NOT NULL,
    github_created_at timestamp with time zone NOT NULL,
    github_updated_at timestamp with time zone NOT NULL,
    github_closed_at timestamp with time zone,
    linked_by text NOT NULL,
    linked_at timestamp with time zone NOT NULL DEFAULT (now()),
    refreshed_at timestamp with time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_requirement_evidence" PRIMARY KEY (id),
    CONSTRAINT ck_requirement_evidence_kind CHECK (kind IN ('issue', 'pull_request')),
    CONSTRAINT ck_requirement_evidence_number CHECK (number > 0 AND repository_id > 0),
    CONSTRAINT ck_requirement_evidence_state CHECK (state IN ('open', 'closed', 'merged')),
    CONSTRAINT "FK_requirement_evidence_requirements_requirement_id" FOREIGN KEY (requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_evidence_user_linked_by" FOREIGN KEY (linked_by) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE INDEX "IX_requirement_evidence_linked_by" ON public.requirement_evidence (linked_by);

CREATE UNIQUE INDEX "IX_requirement_evidence_requirement_id_repository_id_number" ON public.requirement_evidence (requirement_id, repository_id, number);

ALTER TABLE public.requirement_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.requirement_evidence FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.requirement_evidence FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.requirement_evidence FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008073621_RequirementEvidence', '10.0.12');

COMMIT;

