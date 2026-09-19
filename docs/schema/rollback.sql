START TRANSACTION;
DROP TABLE public.acceptance_criteria;

DROP TABLE public.account;

DROP TABLE public.jwks;

DROP TABLE public.project_members;

DROP TABLE public.session;

DROP TABLE public.verification;

DROP TABLE public.requirements;

DROP TABLE public.projects;

DROP TABLE public."user";

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20260919042809_InitialSchema';

COMMIT;

