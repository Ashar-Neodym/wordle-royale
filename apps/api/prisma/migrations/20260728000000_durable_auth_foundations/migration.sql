-- Ticket 243: additive durable credential/session storage.
-- Fail closed before changing any legacy email when canonical forms collide.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "UserAccount"
    WHERE "email" IS NOT NULL AND (
      "email" !~ '^[ -~]+$' OR
      btrim("email") !~ '^[^@[:space:]]+@[^@[:space:]]+$'
    )
  ) THEN
    RAISE EXCEPTION 'durable auth migration blocked: legacy email requires canonical remediation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "UserAccount"
    WHERE "email" IS NOT NULL
    GROUP BY lower(btrim("email"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'durable auth migration blocked: canonical email collision';
  END IF;
END $$;

BEGIN;

UPDATE "UserAccount"
SET "email" = lower(btrim("email"))
WHERE "email" IS NOT NULL AND "email" IS DISTINCT FROM lower(btrim("email"));

CREATE UNIQUE INDEX "UserAccount_email_normalized_key"
  ON "UserAccount" (lower(btrim("email"))) WHERE "email" IS NOT NULL;

CREATE TABLE "PasswordCredential" (
  "userId" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "AccountSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "revocationReason" VARCHAR(32),
  CONSTRAINT "AccountSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountSession_tokenHash_key" ON "AccountSession"("tokenHash");
CREATE INDEX "AccountSession_userId_revokedAt_expiresAt_idx" ON "AccountSession"("userId", "revokedAt", "expiresAt");
CREATE INDEX "AccountSession_expiresAt_idx" ON "AccountSession"("expiresAt");

ALTER TABLE "PasswordCredential" ADD CONSTRAINT "PasswordCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountSession" ADD CONSTRAINT "AccountSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION durable_auth_credential_requires_email() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "UserAccount" WHERE "id" = NEW."userId" AND "email" IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'PasswordCredential_requires_email',
      MESSAGE = 'credential requires account email';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION durable_auth_email_required_by_credential() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."email" IS NULL AND EXISTS (SELECT 1 FROM "PasswordCredential" WHERE "userId" = NEW."id") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'PasswordCredential_requires_email',
      MESSAGE = 'credential requires account email';
  END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER "PasswordCredential_requires_email"
  AFTER INSERT OR UPDATE OF "userId" ON "PasswordCredential"
  DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW
  EXECUTE FUNCTION durable_auth_credential_requires_email();
CREATE CONSTRAINT TRIGGER "UserAccount_credential_requires_email"
  AFTER UPDATE OF "email" ON "UserAccount"
  DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW
  EXECUTE FUNCTION durable_auth_email_required_by_credential();

COMMIT;
