START TRANSACTION;
DROP TABLE public."rateLimit";

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20260921021458_AuthRateLimits';

COMMIT;

