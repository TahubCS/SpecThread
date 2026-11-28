START TRANSACTION;
CREATE TABLE public.project_verifications (
    project_id uuid NOT NULL,
    repository_id bigint NOT NULL,
    workflow text NOT NULL,
    branch text NOT NULL,
    configured_by text NOT NULL,
    configured_at timestamp with time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_project_verifications" PRIMARY KEY (project_id),
    CONSTRAINT ck_project_verifications_branch CHECK (char_length(branch) BETWEEN 1 AND 255 AND branch !~ '\s'),
    CONSTRAINT ck_project_verifications_workflow CHECK (workflow ~ '^[A-Za-z0-9._-]{1,100}\.ya?ml$'),
    CONSTRAINT "FK_project_verifications_projects_project_id" FOREIGN KEY (project_id) REFERENCES public.projects (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_project_verifications_user_configured_by" FOREIGN KEY (configured_by) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE TABLE public.verification_runs (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    requirement_id uuid NOT NULL,
    repository_id bigint NOT NULL,
    workflow text NOT NULL,
    branch text NOT NULL,
    status text NOT NULL,
    result text,
    github_run_id bigint,
    url text,
    requested_by text NOT NULL,
    requested_at timestamp with time zone NOT NULL DEFAULT (now()),
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    checked_at timestamp with time zone,
    CONSTRAINT "PK_verification_runs" PRIMARY KEY (id),
    CONSTRAINT ck_verification_runs_result CHECK ((status = 'completed') = (result IS NOT NULL) AND (result IS NULL OR result IN ('passed', 'failed', 'cancelled', 'skipped', 'neutral', 'not_started'))),
    CONSTRAINT ck_verification_runs_status CHECK (status IN ('requested', 'running', 'completed')),
    CONSTRAINT "FK_verification_runs_requirements_requirement_id" FOREIGN KEY (requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_verification_runs_user_requested_by" FOREIGN KEY (requested_by) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE INDEX "IX_project_verifications_configured_by" ON public.project_verifications (configured_by);

CREATE INDEX "IX_verification_runs_requested_by" ON public.verification_runs (requested_by);

CREATE INDEX "IX_verification_runs_requirement_id_requested_at" ON public.verification_runs (requirement_id, requested_at);

ALTER TABLE public."project_verifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."project_verifications" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."project_verifications" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."project_verifications" FROM authenticated;
  END IF;
END $security$;

ALTER TABLE public."verification_runs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."verification_runs" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."verification_runs" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."verification_runs" FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261128092433_ProjectVerification', '10.0.12');

COMMIT;

