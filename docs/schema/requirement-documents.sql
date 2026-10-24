START TRANSACTION;
CREATE TABLE public.requirement_documents (
    requirement_id uuid NOT NULL,
    document_id uuid NOT NULL,
    linked_by text NOT NULL,
    linked_at timestamp with time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_requirement_documents" PRIMARY KEY (requirement_id, document_id),
    CONSTRAINT "FK_requirement_documents_documents_document_id" FOREIGN KEY (document_id) REFERENCES public.documents (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_documents_requirements_requirement_id" FOREIGN KEY (requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirement_documents_user_linked_by" FOREIGN KEY (linked_by) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE INDEX "IX_requirement_documents_document_id" ON public.requirement_documents (document_id);

CREATE INDEX "IX_requirement_documents_linked_by" ON public.requirement_documents (linked_by);

ALTER TABLE public."requirement_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."requirement_documents" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."requirement_documents" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."requirement_documents" FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261024003629_RequirementDocuments', '10.0.12');

COMMIT;

