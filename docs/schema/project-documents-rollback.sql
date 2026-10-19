START TRANSACTION;
DROP TABLE public.document_contents;

DROP TABLE public.documents;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261018234943_ProjectDocuments';

COMMIT;

