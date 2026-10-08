START TRANSACTION;
ALTER TABLE public.team_members ADD is_expanded boolean NOT NULL DEFAULT TRUE;

ALTER TABLE public.team_members ADD is_favorite boolean NOT NULL DEFAULT FALSE;

CREATE TABLE public.user_onboarding (
    user_id text NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    CONSTRAINT "PK_user_onboarding" PRIMARY KEY (user_id),
    CONSTRAINT "FK_user_onboarding_user_user_id" FOREIGN KEY (user_id) REFERENCES public."user" (id) ON DELETE CASCADE
);

INSERT INTO public.user_onboarding (user_id, completed_at)
SELECT user_id, min(joined_at) FROM public.team_members GROUP BY user_id;
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_onboarding FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.user_onboarding FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.user_onboarding FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008065629_TeamNavigationOnboarding', '10.0.12');

COMMIT;
