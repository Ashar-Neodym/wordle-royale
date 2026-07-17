-- Ticket 158: expand-only server-authoritative Speed 1v1 persistence.

CREATE TYPE "SpeedTerminalReason" AS ENUM (
  'solved', 'max_guesses', 'deadline_timeout', 'forfeit',
  'awarded_forfeit_win', 'no_contest', 'operator_void'
);
CREATE TYPE "SpeedParticipantResult" AS ENUM ('win', 'loss', 'draw', 'void');
CREATE TYPE "SpeedCompletionReason" AS ENUM (
  'all_players_terminal', 'deadline', 'forfeit', 'ready_timeout', 'operator_void'
);
CREATE TYPE "MatchMutationKind" AS ENUM ('speed_ready', 'speed_guess', 'speed_forfeit');

ALTER TABLE "Match"
  ADD COLUMN "rulesetVersion" TEXT,
  ADD COLUMN "readyDeadlineAt" TIMESTAMP(3),
  ADD COLUMN "adjudicatedAt" TIMESTAMP(3),
  ADD COLUMN "adjudicationVersion" TEXT,
  ADD COLUMN "completionReason" "SpeedCompletionReason";

ALTER TABLE "MatchRound"
  ADD COLUMN "deadlineAt" TIMESTAMP(3);

ALTER TABLE "MatchParticipant"
  ADD COLUMN "readyAt" TIMESTAMP(3),
  ADD COLUMN "lastServerEventAt" TIMESTAMP(3),
  ADD COLUMN "terminalAt" TIMESTAMP(3),
  ADD COLUMN "terminalReason" "SpeedTerminalReason",
  ADD COLUMN "guessesUsed" INTEGER,
  ADD COLUMN "solveElapsedMs" INTEGER,
  ADD COLUMN "solveTimeBucket" INTEGER,
  ADD COLUMN "result" "SpeedParticipantResult";

CREATE TABLE "MatchMutationRequest" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "kind" "MatchMutationKind" NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "resultSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchMutationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatchMutationRequest_participantId_kind_clientRequestId_key"
  ON "MatchMutationRequest"("participantId", "kind", "clientRequestId");
CREATE INDEX "MatchMutationRequest_matchId_createdAt_idx"
  ON "MatchMutationRequest"("matchId", "createdAt");
ALTER TABLE "MatchMutationRequest"
  ADD CONSTRAINT "MatchMutationRequest_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchMutationRequest"
  ADD CONSTRAINT "MatchMutationRequest_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "MatchParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fail rather than silently cancelling incompatible active rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "MatchmakingTicket"
     WHERE "state" IN ('queued', 'matched')
     GROUP BY "userId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one active ranked activity per user: conflicting active matchmaking tickets exist';
  END IF;
END $$;

DROP INDEX "matchmaking_ticket_one_active_per_user_mode";
CREATE UNIQUE INDEX "matchmaking_ticket_one_active_ranked_per_user"
  ON "MatchmakingTicket" ("userId")
  WHERE "state" IN ('queued', 'matched');

CREATE INDEX "speed_match_ready_due_idx"
  ON "Match" ("readyDeadlineAt", "id")
  WHERE "rankedMode" = 'speed_1v1' AND "status" = 'pending' AND "readyDeadlineAt" IS NOT NULL;
CREATE INDEX "speed_round_deadline_due_idx"
  ON "MatchRound" ("deadlineAt", "matchId")
  WHERE "completedAt" IS NULL AND "deadlineAt" IS NOT NULL;

ALTER TABLE "MatchRound" ADD CONSTRAINT "speed_round_deadline_consistency"
  CHECK (
    "deadlineAt" IS NULL OR
    ("startedAt" IS NOT NULL AND "deadlineAt" = "startedAt" + INTERVAL '75 seconds')
  );
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "speed_guesses_used_range"
  CHECK ("guessesUsed" IS NULL OR "guessesUsed" BETWEEN 1 AND 6);
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "speed_solve_elapsed_range"
  CHECK ("solveElapsedMs" IS NULL OR "solveElapsedMs" BETWEEN 0 AND 75000);
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "speed_solve_bucket_consistency"
  CHECK (
    ("solveElapsedMs" IS NULL AND "solveTimeBucket" IS NULL) OR
    ("solveElapsedMs" IS NOT NULL AND "solveTimeBucket" = FLOOR("solveElapsedMs" / 100.0))
  );
