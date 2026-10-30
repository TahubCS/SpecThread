START TRANSACTION;
DROP TABLE public.requirement_follow_up_events;

DROP TABLE public.requirement_follow_ups;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261030001248_RequirementFollowUps';

COMMIT;

