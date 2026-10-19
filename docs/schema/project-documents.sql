START TRANSACTION;
CREATE TABLE public.documents (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    project_id uuid NOT NULL,
    title text NOT NULL,
    file_name text NOT NULL,
    content_type text NOT NULL,
    size_bytes bigint NOT NULL,
    uploaded_by text NOT NULL,
    uploaded_at timestamp with time zone NOT NULL DEFAULT (now()),
    archived_at timestamp with time zone,
    CONSTRAINT "PK_documents" PRIMARY KEY (id),
    CONSTRAINT ck_documents_content_type CHECK (content_type IN ('application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
    CONSTRAINT ck_documents_file_name CHECK (length(btrim(file_name)) > 0),
    CONSTRAINT ck_documents_size CHECK (size_bytes BETWEEN 1 AND 4194304),
    CONSTRAINT ck_documents_title CHECK (length(btrim(title)) > 0),
    CONSTRAINT "FK_documents_projects_project_id" FOREIGN KEY (project_id) REFERENCES public.projects (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_documents_user_uploaded_by" FOREIGN KEY (uploaded_by) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE TABLE public.document_contents (
    document_id uuid NOT NULL,
    content bytea NOT NULL,
    CONSTRAINT "PK_document_contents" PRIMARY KEY (document_id),
    CONSTRAINT "FK_document_contents_documents_document_id" FOREIGN KEY (document_id) REFERENCES public.documents (id) ON DELETE RESTRICT
);

CREATE INDEX "IX_documents_project_id" ON public.documents (project_id);

CREATE INDEX "IX_documents_uploaded_by" ON public.documents (uploaded_by);

ALTER TABLE public."documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."documents" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."documents" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."documents" FROM authenticated;
  END IF;
END $security$;
ALTER TABLE public."document_contents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."document_contents" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."document_contents" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."document_contents" FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261018234943_ProjectDocuments', '10.0.12');

COMMIT;

