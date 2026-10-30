START TRANSACTION;
ALTER TABLE public.requirement_reviews ADD criteria_version integer;

CREATE TABLE public.requirement_criteria_versions (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    requirement_id uuid NOT NULL,
    number integer NOT NULL,
    criteria jsonb NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_requirement_criteria_versions" PRIMARY KEY (id),
    CONSTRAINT ck_requirement_criteria_versions_criteria CHECK (jsonb_typeof(criteria) = 'array'),
    CONSTRAINT ck_requirement_criteria_versions_number CHECK (number > 0),
    CONSTRAINT "FK_requirement_criteria_versions_requirements_requirement_id" FOREIGN KEY (requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_criteria_versions_user_created_by" FOREIGN KEY (created_by) REFERENCES public."user" (id) ON DELETE RESTRICT
);

ALTER TABLE public.requirement_reviews ADD CONSTRAINT ck_requirement_reviews_criteria_version CHECK (criteria_version IS NULL OR criteria_version > 0);

CREATE INDEX "IX_requirement_criteria_versions_created_by" ON public.requirement_criteria_versions (created_by);

CREATE UNIQUE INDEX "IX_requirement_criteria_versions_requirement_id_number" ON public.requirement_criteria_versions (requirement_id, number);

ALTER TABLE public."requirement_criteria_versions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."requirement_criteria_versions" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."requirement_criteria_versions" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."requirement_criteria_versions" FROM authenticated;
  END IF;
END $security$;
INSERT INTO public.requirement_criteria_versions (requirement_id, number, criteria, created_by, created_at)
SELECT r.id, 1,
  COALESCE((SELECT jsonb_agg(c.text ORDER BY c.position) FROM public.acceptance_criteria c WHERE c.requirement_id = r.id), '[]'::jsonb),
  COALESCE(r.updated_by, r.created_by), r.updated_at
FROM public.requirements r;
UPDATE public.requirement_reviews v SET criteria_version = 1
FROM public.requirements r
WHERE r.id = v.requirement_id AND v.requirement_version = r.version AND v.criteria_version IS NULL;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261030001133_RequirementCriteriaVersions', '10.0.12');

COMMIT;

