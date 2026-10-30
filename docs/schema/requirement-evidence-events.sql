START TRANSACTION;
CREATE TABLE public.requirement_evidence_events (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    requirement_id uuid NOT NULL,
    evidence_id uuid NOT NULL,
    action text NOT NULL,
    kind text NOT NULL,
    label text NOT NULL,
    title text NOT NULL,
    actor text NOT NULL,
    occurred_at timestamp with time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_requirement_evidence_events" PRIMARY KEY (id),
    CONSTRAINT ck_requirement_evidence_events_action CHECK (action IN ('added', 'removed')),
    CONSTRAINT ck_requirement_evidence_events_kind CHECK (kind IN ('issue', 'pull_request', 'commit', 'release')),
    CONSTRAINT ck_requirement_evidence_events_label CHECK (length(btrim(label)) > 0),
    CONSTRAINT "FK_requirement_evidence_events_requirements_requirement_id" FOREIGN KEY (requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_evidence_events_user_actor" FOREIGN KEY (actor) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE INDEX "IX_requirement_evidence_events_actor" ON public.requirement_evidence_events (actor);

CREATE INDEX "IX_requirement_evidence_events_requirement_id_occurred_at" ON public.requirement_evidence_events (requirement_id, occurred_at);

ALTER TABLE public."requirement_evidence_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."requirement_evidence_events" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."requirement_evidence_events" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."requirement_evidence_events" FROM authenticated;
  END IF;
END $security$;
INSERT INTO public.requirement_evidence_events (requirement_id, evidence_id, action, kind, label, title, actor, occurred_at)
SELECT e.requirement_id, e.id, 'added', e.kind,
  CASE WHEN e.number IS NOT NULL THEN '#' || e.number WHEN e.tag IS NOT NULL THEN e.tag ELSE left(e.sha, 7) END,
  e.title, e.linked_by, e.linked_at
FROM public.requirement_evidence e;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261030130820_RequirementEvidenceEvents', '10.0.12');

COMMIT;

