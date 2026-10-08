START TRANSACTION;
CREATE TABLE public.teams (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    name character varying(200) NOT NULL,
    description character varying(10000) NOT NULL,
    owner_user_id text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_teams" PRIMARY KEY (id),
    CONSTRAINT ck_teams_name CHECK (length(btrim(name)) > 0),
    CONSTRAINT "FK_teams_user_owner_user_id" FOREIGN KEY (owner_user_id) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE TABLE public.team_members (
    team_id uuid NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL DEFAULT 'member',
    joined_at timestamp with time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_team_members" PRIMARY KEY (team_id, user_id),
    CONSTRAINT ck_team_members_role CHECK (role IN ('admin', 'member')),
    CONSTRAINT "FK_team_members_teams_team_id" FOREIGN KEY (team_id) REFERENCES public.teams (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_team_members_user_user_id" FOREIGN KEY (user_id) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE INDEX "IX_team_members_user_id" ON public.team_members (user_id);

CREATE INDEX "IX_teams_owner_user_id" ON public.teams (owner_user_id);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teams, public.team_members FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.teams, public.team_members FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.teams, public.team_members FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008055721_Teams', '10.0.12');

COMMIT;
