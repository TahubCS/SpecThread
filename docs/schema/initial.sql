CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;
CREATE TABLE public.jwks (
    id text NOT NULL,
    "publicKey" text NOT NULL,
    "privateKey" text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "expiresAt" timestamp with time zone,
    alg text,
    crv text,
    CONSTRAINT "PK_jwks" PRIMARY KEY (id)
);

CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL DEFAULT FALSE,
    image text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_user" PRIMARY KEY (id)
);

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_verification" PRIMARY KEY (id)
);

CREATE TABLE public.account (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_account" PRIMARY KEY (id),
    CONSTRAINT "FK_account_user_userId" FOREIGN KEY ("userId") REFERENCES public."user" (id) ON DELETE CASCADE
);

CREATE TABLE public.projects (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    name text NOT NULL,
    owner_user_id text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT (now()),
    archived_at timestamp with time zone,
    CONSTRAINT "PK_projects" PRIMARY KEY (id),
    CONSTRAINT ck_projects_name CHECK (length(btrim(name)) > 0),
    CONSTRAINT "FK_projects_user_owner_user_id" FOREIGN KEY (owner_user_id) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE TABLE public.session (
    id text NOT NULL,
    "userId" text NOT NULL,
    token text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_session" PRIMARY KEY (id),
    CONSTRAINT "FK_session_user_userId" FOREIGN KEY ("userId") REFERENCES public."user" (id) ON DELETE CASCADE
);

CREATE TABLE public.project_members (
    project_id uuid NOT NULL,
    user_id text NOT NULL,
    joined_at timestamp with time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_project_members" PRIMARY KEY (project_id, user_id),
    CONSTRAINT "FK_project_members_projects_project_id" FOREIGN KEY (project_id) REFERENCES public.projects (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_project_members_user_user_id" FOREIGN KEY (user_id) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE TABLE public.requirements (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    project_id uuid NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT (now()),
    updated_at timestamp with time zone NOT NULL DEFAULT (now()),
    archived_at timestamp with time zone,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT "PK_requirements" PRIMARY KEY (id),
    CONSTRAINT ck_requirements_title CHECK (length(btrim(title)) > 0),
    CONSTRAINT ck_requirements_version CHECK (version > 0),
    CONSTRAINT "FK_requirements_projects_project_id" FOREIGN KEY (project_id) REFERENCES public.projects (id) ON DELETE RESTRICT,
    CONSTRAINT "FK_requirements_user_created_by" FOREIGN KEY (created_by) REFERENCES public."user" (id) ON DELETE RESTRICT
);

CREATE TABLE public.acceptance_criteria (
    id uuid NOT NULL DEFAULT (gen_random_uuid()),
    requirement_id uuid NOT NULL,
    text text NOT NULL,
    position integer NOT NULL,
    CONSTRAINT "PK_acceptance_criteria" PRIMARY KEY (id),
    CONSTRAINT ck_criteria_position CHECK (position >= 0),
    CONSTRAINT ck_criteria_text CHECK (length(btrim(text)) > 0),
    CONSTRAINT "FK_acceptance_criteria_requirements_requirement_id" FOREIGN KEY (requirement_id) REFERENCES public.requirements (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "IX_acceptance_criteria_requirement_id_position" ON public.acceptance_criteria (requirement_id, position);

CREATE UNIQUE INDEX "IX_account_providerId_accountId" ON public.account ("providerId", "accountId");

CREATE INDEX "IX_account_userId" ON public.account ("userId");

CREATE INDEX "IX_project_members_user_id" ON public.project_members (user_id);

CREATE INDEX "IX_projects_owner_user_id" ON public.projects (owner_user_id);

CREATE INDEX "IX_requirements_created_by" ON public.requirements (created_by);

CREATE INDEX "IX_requirements_project_id" ON public.requirements (project_id);

CREATE UNIQUE INDEX "IX_session_token" ON public.session (token);

CREATE INDEX "IX_session_userId" ON public.session ("userId");

CREATE UNIQUE INDEX "IX_user_email" ON public."user" (email);

CREATE INDEX "IX_verification_identifier" ON public.verification (identifier);

ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."user" FROM PUBLIC;
ALTER TABLE public."session" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."session" FROM PUBLIC;
ALTER TABLE public."account" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."account" FROM PUBLIC;
ALTER TABLE public."verification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."verification" FROM PUBLIC;
ALTER TABLE public."jwks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."jwks" FROM PUBLIC;
ALTER TABLE public."projects" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."projects" FROM PUBLIC;
ALTER TABLE public."project_members" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."project_members" FROM PUBLIC;
ALTER TABLE public."requirements" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."requirements" FROM PUBLIC;
ALTER TABLE public."acceptance_criteria" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."acceptance_criteria" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."user", public."session", public."account", public."verification", public."jwks", public."projects", public."project_members", public."requirements", public."acceptance_criteria" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."user", public."session", public."account", public."verification", public."jwks", public."projects", public."project_members", public."requirements", public."acceptance_criteria" FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260919042809_InitialSchema', '10.0.12');

COMMIT;

