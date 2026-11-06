START TRANSACTION;
ALTER TABLE public.requirement_evidence_events DROP CONSTRAINT ck_requirement_evidence_events_action;

ALTER TABLE public.requirement_evidence_events ADD other_requirement_id uuid;

CREATE TABLE public.requirement_evidence_suggestions (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    requirement_id uuid NOT NULL,
    repository_id bigint NOT NULL,
    number integer NOT NULL,
    title text NOT NULL,
    state text NOT NULL,
    author text,
    url text NOT NULL,
    reference text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    found_at timestamp with time zone NOT NULL DEFAULT (now()),
    decided_by text,
    decided_at timestamp with time zone,
    CONSTRAINT "PK_requirement_evidence_suggestions" PRIMARY KEY (id),
    CONSTRAINT ck_requirement_evidence_suggestions_decision CHECK ((status = 'pending') = (decided_by IS NULL) AND (decided_by IS NULL) = (decided_at IS NULL)),
    CONSTRAINT ck_requirement_evidence_suggestions_number CHECK (number > 0 AND repository_id > 0),
    CONSTRAINT ck_requirement_evidence_suggestions_state CHECK (state IN ('open', 'closed', 'merged')),
    CONSTRAINT ck_requirement_evidence_suggestions_status CHECK (status IN ('pending', 'confirmed', 'rejected')),
    CONSTRAINT "FK_requirement_evidence_suggestions_requirements_requirement_id" FOREIGN KEY (requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_evidence_suggestions_user_decided_by" FOREIGN KEY (decided_by) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE INDEX "IX_requirement_evidence_events_other_requirement_id" ON public.requirement_evidence_events (other_requirement_id);

ALTER TABLE public.requirement_evidence_events ADD CONSTRAINT ck_requirement_evidence_events_action CHECK (action IN ('added', 'removed', 'confirmed', 'rejected', 'moved_in', 'moved_out'));

ALTER TABLE public.requirement_evidence_events ADD CONSTRAINT ck_requirement_evidence_events_move CHECK ((action IN ('moved_in', 'moved_out')) = (other_requirement_id IS NOT NULL));

CREATE INDEX "IX_requirement_evidence_suggestions_decided_by" ON public.requirement_evidence_suggestions (decided_by);

CREATE UNIQUE INDEX "IX_requirement_evidence_suggestions_requirement_id_repository_~" ON public.requirement_evidence_suggestions (requirement_id, repository_id, number);

ALTER TABLE public.requirement_evidence_events ADD CONSTRAINT "FK_requirement_evidence_events_requirements_other_requirement_~" FOREIGN KEY (other_requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT;

ALTER TABLE public."requirement_evidence_suggestions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."requirement_evidence_suggestions" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."requirement_evidence_suggestions" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."requirement_evidence_suggestions" FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261106010723_RequirementEvidenceSuggestions', '10.0.12');

COMMIT;

