START TRANSACTION;
CREATE TABLE public.project_repositories (
    project_id uuid NOT NULL,
    installation_id bigint NOT NULL,
    repository_id bigint NOT NULL,
    owner text NOT NULL,
    name text NOT NULL,
    is_private boolean NOT NULL,
    connected_by text NOT NULL,
    connected_at timestamp with time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_project_repositories" PRIMARY KEY (project_id),
    CONSTRAINT ck_project_repositories_ids CHECK (installation_id > 0 AND repository_id > 0),
    CONSTRAINT ck_project_repositories_name CHECK (length(btrim(owner)) > 0 AND length(btrim(name)) > 0),
    CONSTRAINT "FK_project_repositories_projects_project_id" FOREIGN KEY (project_id) REFERENCES public.projects (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_project_repositories_user_connected_by" FOREIGN KEY (connected_by) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE INDEX "IX_project_repositories_connected_by" ON public.project_repositories (connected_by);

ALTER TABLE public.project_repositories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_repositories FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.project_repositories FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.project_repositories FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008070130_ProjectRepositories', '10.0.12');

COMMIT;

