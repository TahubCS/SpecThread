START TRANSACTION;
CREATE TABLE public."rateLimit" (
    id text NOT NULL,
    key text NOT NULL,
    count integer NOT NULL,
    "lastRequest" bigint NOT NULL,
    CONSTRAINT "PK_rateLimit" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX "IX_rateLimit_key" ON public."rateLimit" (key);

CREATE INDEX "IX_rateLimit_lastRequest" ON public."rateLimit" ("lastRequest");

ALTER TABLE public."rateLimit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."rateLimit" FROM PUBLIC;
DO $security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."rateLimit" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."rateLimit" FROM authenticated;
  END IF;
END $security$;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260921021458_AuthRateLimits', '10.0.12');

COMMIT;

