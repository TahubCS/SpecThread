START TRANSACTION;
DROP TABLE public.team_invitations;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261008080807_TeamInvitations';

COMMIT;
