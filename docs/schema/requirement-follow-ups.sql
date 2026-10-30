START TRANSACTION;
CREATE TABLE public.requirement_follow_up_events (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    requirement_id uuid NOT NULL,
    original_requirement_id uuid NOT NULL,
    action text NOT NULL,
    actor text NOT NULL,
    occurred_at timestamp with time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_requirement_follow_up_events" PRIMARY KEY (id),
    CONSTRAINT ck_requirement_follow_up_events_action CHECK (action IN ('added', 'removed')),
    CONSTRAINT ck_requirement_follow_up_events_distinct CHECK (requirement_id <> original_requirement_id),
    CONSTRAINT "FK_requirement_follow_up_events_requirements_original_requirem~" FOREIGN KEY (original_requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_follow_up_events_requirements_requirement_id" FOREIGN KEY (requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_follow_up_events_user_actor" FOREIGN KEY (actor) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE TABLE public.requirement_follow_ups (
    requirement_id uuid NOT NULL,
    original_requirement_id uuid NOT NULL,
    linked_by text NOT NULL,
    linked_at timestamp with time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_requirement_follow_ups" PRIMARY KEY (requirement_id, original_requirement_id),
    CONSTRAINT ck_requirement_follow_ups_distinct CHECK (requirement_id <> original_requirement_id),
    CONSTRAINT "FK_requirement_follow_ups_requirements_original_requirement_id" FOREIGN KEY (original_requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_follow_ups_requirements_requirement_id" FOREIGN KEY (requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_follow_ups_user_linked_by" FOREIGN KEY (linked_by) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE INDEX "IX_requirement_follow_up_events_actor" ON public.requirement_follow_up_events (actor);

CREATE INDEX "IX_requirement_follow_up_events_original_requirement_id" ON public.requirement_follow_up_events (original_requirement_id);

CREATE INDEX "IX_requirement_follow_up_events_requirement_id" ON public.requirement_follow_up_events (requirement_id);

CREATE INDEX "IX_requirement_follow_ups_linked_by" ON public.requirement_follow_ups (linked_by);

CREATE INDEX "IX_requirement_follow_ups_original_requirement_id" ON public.requirement_follow_ups (original_requirement_id);

ALTER TABLE public."requirement_follow_ups" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."requirement_follow_ups" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."requirement_follow_ups" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."requirement_follow_ups" FROM authenticated;
  END IF;
END $security$;

ALTER TABLE public."requirement_follow_up_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."requirement_follow_up_events" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."requirement_follow_up_events" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."requirement_follow_up_events" FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261030001248_RequirementFollowUps', '10.0.12');

COMMIT;

