START TRANSACTION;
CREATE TABLE public.requirement_events (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    requirement_id uuid NOT NULL,
    action text NOT NULL,
    version integer,
    changes text[],
    milestone text,
    actor text NOT NULL,
    occurred_at timestamp with time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_requirement_events" PRIMARY KEY (id),
    CONSTRAINT ck_requirement_events_action CHECK (action IN ('created', 'edited', 'archived', 'restored', 'milestone_set', 'milestone_cleared')),
    CONSTRAINT ck_requirement_events_changes CHECK (changes IS NULL OR (action = 'edited' AND changes <@ ARRAY['title', 'description', 'criteria', 'documents']::text[])),
    CONSTRAINT ck_requirement_events_milestone CHECK ((milestone IS NOT NULL) = (action = 'milestone_set')),
    CONSTRAINT ck_requirement_events_version CHECK (version IS NULL OR version > 0),
    CONSTRAINT "FK_requirement_events_requirements_requirement_id" FOREIGN KEY (requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_events_user_actor" FOREIGN KEY (actor) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE INDEX "IX_requirement_events_actor" ON public.requirement_events (actor);

CREATE INDEX "IX_requirement_events_requirement_id_occurred_at" ON public.requirement_events (requirement_id, occurred_at);

ALTER TABLE public."requirement_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."requirement_events" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."requirement_events" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."requirement_events" FROM authenticated;
  END IF;
END $security$;

INSERT INTO public.requirement_events (requirement_id, action, version, actor, occurred_at)
SELECT id, 'created', 1, created_by, created_at FROM public.requirements;
INSERT INTO public.requirement_events (requirement_id, action, version, actor, occurred_at)
SELECT id, 'edited', version, COALESCE(updated_by, created_by), updated_at FROM public.requirements WHERE version > 1;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261128072910_RequirementEvents', '10.0.12');

COMMIT;

