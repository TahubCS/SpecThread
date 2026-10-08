START TRANSACTION;
DROP TABLE public.requirement_reviews;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261008092413_RequirementReviews';

COMMIT;

