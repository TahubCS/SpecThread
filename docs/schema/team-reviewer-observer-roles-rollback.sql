START TRANSACTION;
ALTER TABLE public.team_members DROP CONSTRAINT ck_team_members_role;

ALTER TABLE public.team_invitations DROP CONSTRAINT ck_team_invitations_role;

UPDATE public.team_members m SET role = 'member' FROM public.teams t
  WHERE m.team_id = t.id AND m.user_id = t.owner_user_id AND m.role IN ('reviewer', 'observer');
DELETE FROM public.team_members WHERE role IN ('reviewer', 'observer');
DELETE FROM public.team_invitations WHERE role IN ('reviewer', 'observer');

ALTER TABLE public.team_members ADD CONSTRAINT ck_team_members_role CHECK (role IN ('admin', 'member'));

ALTER TABLE public.team_invitations ADD CONSTRAINT ck_team_invitations_role CHECK (role IN ('admin', 'member'));

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261117231221_TeamReviewerObserverRoles';

COMMIT;

