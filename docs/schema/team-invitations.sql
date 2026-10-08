START TRANSACTION;
CREATE TABLE public.team_invitations (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    team_id uuid NOT NULL,
    email character varying(254) NOT NULL,
    role text NOT NULL,
    invited_by text NOT NULL,
    token_hash character varying(64) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    issued_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by text,
    revoked_at timestamp with time zone,
    CONSTRAINT "PK_team_invitations" PRIMARY KEY (id),
    CONSTRAINT ck_team_invitations_expiry CHECK (expires_at > issued_at),
    CONSTRAINT ck_team_invitations_resolution CHECK (accepted_at IS NULL OR revoked_at IS NULL),
    CONSTRAINT ck_team_invitations_role CHECK (role IN ('admin', 'member')),
    CONSTRAINT "FK_team_invitations_teams_team_id" FOREIGN KEY (team_id) REFERENCES public.teams (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_team_invitations_user_accepted_by" FOREIGN KEY (accepted_by) REFERENCES public."user" (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_team_invitations_user_invited_by" FOREIGN KEY (invited_by) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE INDEX "IX_team_invitations_accepted_by" ON public.team_invitations (accepted_by);

CREATE INDEX "IX_team_invitations_invited_by" ON public.team_invitations (invited_by);

CREATE UNIQUE INDEX "IX_team_invitations_team_id_email" ON public.team_invitations (team_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX "IX_team_invitations_token_hash" ON public.team_invitations (token_hash);

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.team_invitations FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.team_invitations FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.team_invitations FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008080807_TeamInvitations', '10.0.12');

COMMIT;
