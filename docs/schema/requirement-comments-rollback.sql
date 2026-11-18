START TRANSACTION;
DROP TABLE public.requirement_comment_events;

DROP TABLE public.requirement_comments;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261118144936_RequirementComments';

COMMIT;

