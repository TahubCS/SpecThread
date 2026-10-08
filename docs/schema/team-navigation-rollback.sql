START TRANSACTION;
DROP TABLE public.user_onboarding;

ALTER TABLE public.team_members DROP COLUMN is_expanded;

ALTER TABLE public.team_members DROP COLUMN is_favorite;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261008065629_TeamNavigationOnboarding';

COMMIT;
