START TRANSACTION;
ALTER TABLE public.requirements ADD updated_by text;

UPDATE public.requirements SET updated_by = created_by WHERE updated_by IS NULL;

CREATE INDEX "IX_requirements_updated_by" ON public.requirements (updated_by);

ALTER TABLE public.requirements ADD CONSTRAINT "FK_requirements_user_updated_by" FOREIGN KEY (updated_by) REFERENCES public."user" (id) ON DELETE RESTRICT;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261024010934_RequirementUpdatedBy', '10.0.12');

COMMIT;

