START TRANSACTION;
CREATE TABLE public.requirement_reviews (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    requirement_id uuid NOT NULL,
    decision text NOT NULL,
    note text NOT NULL DEFAULT '',
    requirement_version integer NOT NULL,
    evidence jsonb NOT NULL,
    decided_by text NOT NULL,
    decided_at timestamp with time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_requirement_reviews" PRIMARY KEY (id),
    CONSTRAINT ck_requirement_reviews_decision CHECK (decision IN ('accepted', 'rejected', 'more_evidence')),
    CONSTRAINT ck_requirement_reviews_evidence CHECK (jsonb_typeof(evidence) = 'array'),
    CONSTRAINT ck_requirement_reviews_note CHECK (decision = 'accepted' OR length(btrim(note)) > 0),
    CONSTRAINT ck_requirement_reviews_version CHECK (requirement_version > 0),
    CONSTRAINT "FK_requirement_reviews_requirements_requirement_id" FOREIGN KEY (requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_reviews_user_decided_by" FOREIGN KEY (decided_by) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE INDEX "IX_requirement_reviews_decided_by" ON public.requirement_reviews (decided_by);

CREATE INDEX "IX_requirement_reviews_requirement_id_decided_at" ON public.requirement_reviews (requirement_id, decided_at);

ALTER TABLE public.requirement_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.requirement_reviews FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.requirement_reviews FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.requirement_reviews FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008092413_RequirementReviews', '10.0.12');

COMMIT;

