-- Ticket 244: fleet-shared, privacy-preserving fixed-window auth limiter.
BEGIN;
CREATE TABLE "AuthRateLimitBucket" (
  "action" VARCHAR(32) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "blockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthRateLimitBucket_pkey" PRIMARY KEY ("action", "keyHash"),
  CONSTRAINT "AuthRateLimitBucket_attemptCount_check" CHECK ("attemptCount" >= 0)
);
CREATE INDEX "AuthRateLimitBucket_windowStartedAt_idx" ON "AuthRateLimitBucket"("windowStartedAt");
CREATE INDEX "AuthRateLimitBucket_blockedUntil_idx" ON "AuthRateLimitBucket"("blockedUntil");
COMMIT;
