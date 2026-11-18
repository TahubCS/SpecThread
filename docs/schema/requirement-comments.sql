START TRANSACTION;
CREATE TABLE public.requirement_comments (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    requirement_id uuid NOT NULL,
    parent_id uuid,
    author_id text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT (now()),
    edited_at timestamp with time zone,
    deleted_at timestamp with time zone,
    deleted_by text,
    CONSTRAINT "PK_requirement_comments" PRIMARY KEY (id),
    CONSTRAINT ck_requirement_comments_body CHECK (char_length(body) <= 5000),
    CONSTRAINT ck_requirement_comments_deleted CHECK ((deleted_at IS NULL) = (deleted_by IS NULL) AND (deleted_at IS NULL OR body = '')),
    CONSTRAINT ck_requirement_comments_parent CHECK (parent_id IS NULL OR parent_id <> id),
    CONSTRAINT "FK_requirement_comments_requirement_comments_parent_id" FOREIGN KEY (parent_id) REFERENCES public.requirement_comments (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_comments_requirements_requirement_id" FOREIGN KEY (requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_comments_user_author_id" FOREIGN KEY (author_id) REFERENCES public."user" (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_comments_user_deleted_by" FOREIGN KEY (deleted_by) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE TABLE public.requirement_comment_events (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    requirement_id uuid NOT NULL,
    comment_id uuid NOT NULL,
    action text NOT NULL,
    actor text NOT NULL,
    occurred_at timestamp with time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_requirement_comment_events" PRIMARY KEY (id),
    CONSTRAINT ck_requirement_comment_events_action CHECK (action IN ('created', 'edited', 'deleted')),
    CONSTRAINT "FK_requirement_comment_events_requirement_comments_comment_id" FOREIGN KEY (comment_id) REFERENCES public.requirement_comments (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_comment_events_requirements_requirement_id" FOREIGN KEY (requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_comment_events_user_actor" FOREIGN KEY (actor) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE INDEX "IX_requirement_comment_events_actor" ON public.requirement_comment_events (actor);

CREATE INDEX "IX_requirement_comment_events_comment_id" ON public.requirement_comment_events (comment_id);

CREATE INDEX "IX_requirement_comment_events_requirement_id" ON public.requirement_comment_events (requirement_id);

CREATE INDEX "IX_requirement_comments_author_id" ON public.requirement_comments (author_id);

CREATE INDEX "IX_requirement_comments_deleted_by" ON public.requirement_comments (deleted_by);

CREATE INDEX "IX_requirement_comments_parent_id" ON public.requirement_comments (parent_id);

CREATE INDEX "IX_requirement_comments_requirement_id_created_at" ON public.requirement_comments (requirement_id, created_at);

ALTER TABLE public."requirement_comments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."requirement_comments" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."requirement_comments" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."requirement_comments" FROM authenticated;
  END IF;
END $security$;

ALTER TABLE public."requirement_comment_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."requirement_comment_events" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."requirement_comment_events" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."requirement_comment_events" FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261118144936_RequirementComments', '10.0.12');

COMMIT;

