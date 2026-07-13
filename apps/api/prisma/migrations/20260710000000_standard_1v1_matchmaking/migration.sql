-- CreateEnum
CREATE TYPE "MatchmakingTicketState" AS ENUM ('queued', 'matched', 'consumed', 'cancelled', 'timed_out', 'failed');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "rankedMode" "RankedMode";

-- Existing ranked matches predate first-class ladder attribution and are Standard-compatible.
UPDATE "Match" SET "rankedMode" = 'standard_1v1' WHERE "mode" = 'ranked' AND "rankedMode" IS NULL;

-- CreateTable
CREATE TABLE "MatchmakingTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "RankedMode" NOT NULL DEFAULT 'standard_1v1',
    "rated" BOOLEAN NOT NULL DEFAULT true,
    "state" "MatchmakingTicketState" NOT NULL DEFAULT 'queued',
    "ratingAtQueue" INTEGER NOT NULL,
    "provisionalAtQueue" BOOLEAN NOT NULL DEFAULT true,
    "allowProvisionalOpponent" BOOLEAN NOT NULL DEFAULT true,
    "searchMinRating" INTEGER NOT NULL,
    "searchMaxRating" INTEGER NOT NULL,
    "expansionStep" INTEGER NOT NULL DEFAULT 0,
    "matchedMatchId" TEXT,
    "matchedOpponentUserId" TEXT,
    "matchedOpponentRatingAtQueue" INTEGER,
    "matchedOpponentProvisionalAtQueue" BOOLEAN,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "timedOutAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    CONSTRAINT "MatchmakingTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchmakingTicket_userId_mode_idempotencyKey_key" ON "MatchmakingTicket"("userId", "mode", "idempotencyKey");
CREATE INDEX "MatchmakingTicket_mode_state_searchMinRating_searchMaxRating_createdAt_idx" ON "MatchmakingTicket"("mode", "state", "searchMinRating", "searchMaxRating", "createdAt");
CREATE INDEX "MatchmakingTicket_state_expiresAt_idx" ON "MatchmakingTicket"("state", "expiresAt");
CREATE INDEX "MatchmakingTicket_matchedMatchId_idx" ON "MatchmakingTicket"("matchedMatchId");
CREATE INDEX "MatchmakingTicket_matchedOpponentUserId_idx" ON "MatchmakingTicket"("matchedOpponentUserId");
CREATE INDEX "Match_rankedMode_status_createdAt_idx" ON "Match"("rankedMode", "status", "createdAt");

-- PostgreSQL partial uniqueness guarantees one active ticket per user/mode across API instances.
CREATE UNIQUE INDEX "matchmaking_ticket_one_active_per_user_mode"
ON "MatchmakingTicket" ("userId", "mode")
WHERE "state" IN ('queued', 'matched');

-- AddForeignKey
ALTER TABLE "MatchmakingTicket" ADD CONSTRAINT "MatchmakingTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchmakingTicket" ADD CONSTRAINT "MatchmakingTicket_matchedOpponentUserId_fkey" FOREIGN KEY ("matchedOpponentUserId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MatchmakingTicket" ADD CONSTRAINT "MatchmakingTicket_matchedMatchId_fkey" FOREIGN KEY ("matchedMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;
