START TRANSACTION;
ALTER TABLE public.team_members DROP CONSTRAINT ck_team_members_role;

ALTER TABLE public.team_invitations DROP CONSTRAINT ck_team_invitations_role;

ALTER TABLE public.team_members ADD CONSTRAINT ck_team_members_role CHECK (role IN ('admin', 'member', 'reviewer', 'observer'));

ALTER TABLE public.team_invitations ADD CONSTRAINT ck_team_invitations_role CHECK (role IN ('admin', 'member', 'reviewer', 'observer'));

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261117231221_TeamReviewerObserverRoles', '10.0.12');

COMMIT;

