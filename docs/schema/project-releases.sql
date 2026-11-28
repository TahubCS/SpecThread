START TRANSACTION;
CREATE TABLE public.project_releases (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    project_id uuid NOT NULL,
    repository_id bigint NOT NULL,
    tag text NOT NULL,
    name text NOT NULL,
    sha text NOT NULL,
    url text NOT NULL,
    author text,
    prerelease boolean NOT NULL,
    published_at timestamp with time zone NOT NULL,
    environment text NOT NULL,
    deployed_on date NOT NULL,
    recorded_by text NOT NULL,
    recorded_at timestamp with time zone NOT NULL DEFAULT (now()),
    contains text NOT NULL,
    compared_at timestamp with time zone NOT NULL,
    CONSTRAINT "PK_project_releases" PRIMARY KEY (id),
    CONSTRAINT ck_project_releases_environment CHECK (char_length(environment) BETWEEN 1 AND 50 AND environment = btrim(environment)),
    CONSTRAINT ck_project_releases_sha CHECK (sha ~ '^[0-9a-f]{40}$'),
    CONSTRAINT ck_project_releases_tag CHECK (char_length(tag) BETWEEN 1 AND 255),
    CONSTRAINT "FK_project_releases_projects_project_id" FOREIGN KEY (project_id) REFERENCES public.projects (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_project_releases_user_recorded_by" FOREIGN KEY (recorded_by) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "IX_project_releases_project_id_repository_id_tag_environment" ON public.project_releases (project_id, repository_id, tag, environment);

CREATE INDEX "IX_project_releases_recorded_by" ON public.project_releases (recorded_by);

ALTER TABLE public."project_releases" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."project_releases" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."project_releases" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."project_releases" FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261128074702_ProjectReleases', '10.0.12');

COMMIT;

