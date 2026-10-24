START TRANSACTION;
DROP TABLE public.requirement_documents;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261024003629_RequirementDocuments';

COMMIT;

