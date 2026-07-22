-- Expand-only lifecycle v2 persistence. Existing Speed rows are deliberately
-- left untouched and retain their match-created ready deadline semantics.
ALTER TYPE "SpeedCompletionReason" ADD VALUE IF NOT EXISTS 'invitation_timeout';
ALTER TYPE "SpeedCompletionReason" ADD VALUE IF NOT EXISTS 'pre_start_cancelled';

ALTER TABLE "Match"
  ADD COLUMN IF NOT EXISTS "readyLifecycleVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "invitationExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "readyWindowStartedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "speed_v2_invitation_due_idx"
ON "Match" ("invitationExpiresAt", "id")
WHERE "rankedMode"='speed_1v1'
  AND "status"='pending'
  AND "readyLifecycleVersion"='speed_ready_v2_first_ack_90s'
  AND "readyWindowStartedAt" IS NULL
  AND "adjudicatedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "speed_v2_ready_due_idx"
ON "Match" ("readyDeadlineAt", "id")
WHERE "rankedMode"='speed_1v1'
  AND "status"='pending'
  AND "readyLifecycleVersion"='speed_ready_v2_first_ack_90s'
  AND "readyWindowStartedAt" IS NOT NULL
  AND "adjudicatedAt" IS NULL;
