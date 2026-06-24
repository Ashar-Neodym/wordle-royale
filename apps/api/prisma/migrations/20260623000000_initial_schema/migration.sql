-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserAccountStatus" AS ENUM ('active', 'disabled', 'deleted');

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('training_insights_opt_in', 'analytics_events', 'marketing_email');

-- CreateEnum
CREATE TYPE "ConsentDecision" AS ENUM ('granted', 'denied', 'withdrawn');

-- CreateEnum
CREATE TYPE "DictionaryReleaseStatus" AS ENUM ('draft', 'active', 'retired');

-- CreateEnum
CREATE TYPE "DictionaryWordKind" AS ENUM ('answer', 'guess', 'banned');

-- CreateEnum
CREATE TYPE "LobbyStatus" AS ENUM ('waiting', 'ready', 'in_match', 'closed');

-- CreateEnum
CREATE TYPE "LobbyVisibility" AS ENUM ('private', 'public');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('pending', 'active', 'completed', 'voided', 'cancelled');

-- CreateEnum
CREATE TYPE "MatchMode" AS ENUM ('casual', 'ranked');

-- CreateEnum
CREATE TYPE "ParticipantOutcome" AS ENUM ('pending', 'solved', 'failed', 'abandoned', 'voided');

-- CreateEnum
CREATE TYPE "RatingEventType" AS ENUM ('apply', 'void', 'reversal', 'adjustment');

-- CreateEnum
CREATE TYPE "RatingProfileStatus" AS ENUM ('active', 'suspended', 'reset');

-- CreateTable
CREATE TABLE "UserAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT NOT NULL,
    "status" "UserAccountStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicHandle" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "countryCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "ConsentScope" NOT NULL,
    "decision" "ConsentDecision" NOT NULL,
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DictionaryRelease" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "wordLength" INTEGER NOT NULL DEFAULT 5,
    "version" TEXT NOT NULL,
    "status" "DictionaryReleaseStatus" NOT NULL DEFAULT 'draft',
    "sourceLabel" TEXT NOT NULL,
    "sourceMetadata" JSONB,
    "artifactSha256" TEXT,
    "answerCount" INTEGER NOT NULL DEFAULT 0,
    "guessCount" INTEGER NOT NULL DEFAULT 0,
    "bannedCount" INTEGER NOT NULL DEFAULT 0,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DictionaryRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DictionaryWord" (
    "id" TEXT NOT NULL,
    "dictionaryReleaseId" TEXT NOT NULL,
    "normalizedWord" TEXT NOT NULL,
    "kind" "DictionaryWordKind" NOT NULL,
    "checksum" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DictionaryWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lobby" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "status" "LobbyStatus" NOT NULL DEFAULT 'waiting',
    "visibility" "LobbyVisibility" NOT NULL DEFAULT 'private',
    "mode" "MatchMode" NOT NULL DEFAULT 'casual',
    "maxPlayers" INTEGER NOT NULL DEFAULT 4,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Lobby_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT,
    "dictionaryReleaseId" TEXT NOT NULL,
    "mode" "MatchMode" NOT NULL DEFAULT 'casual',
    "status" "MatchStatus" NOT NULL DEFAULT 'pending',
    "algorithmConfigVersion" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRound" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "dictionaryReleaseId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "answerWordHash" TEXT NOT NULL,
    "answerWordSaltRef" TEXT,
    "maxAttempts" INTEGER NOT NULL DEFAULT 6,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    "outcome" "ParticipantOutcome" NOT NULL DEFAULT 'pending',
    "placement" INTEGER,
    "finalScore" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abandonedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuessAttempt" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "dictionaryReleaseId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "normalizedGuess" TEXT NOT NULL,
    "feedback" JSONB NOT NULL,
    "serverValidation" JSONB NOT NULL,
    "scoreDelta" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "GuessAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreBreakdown" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "roundId" TEXT,
    "participantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreBreakdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchReport" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "participantData" JSONB NOT NULL,
    "publicSummary" JSONB,
    "spoilerSafeShare" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "MatchMode" NOT NULL DEFAULT 'ranked',
    "rating" INTEGER NOT NULL DEFAULT 1500,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "provisionalRemaining" INTEGER NOT NULL DEFAULT 10,
    "algorithm" TEXT NOT NULL DEFAULT 'placement_mmr_v1',
    "algorithmConfigVersion" TEXT NOT NULL,
    "status" "RatingProfileStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingEvent" (
    "id" TEXT NOT NULL,
    "ratingProfileId" TEXT NOT NULL,
    "matchId" TEXT,
    "participantId" TEXT,
    "type" "RatingEventType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "ratingBefore" INTEGER NOT NULL,
    "ratingAfter" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'placement_mmr_v1',
    "algorithmConfigVersion" TEXT NOT NULL,
    "metadata" JSONB,
    "voidedByEventId" TEXT,
    "reversalOfEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardSnapshot" (
    "id" TEXT NOT NULL,
    "mode" "MatchMode" NOT NULL DEFAULT 'ranked',
    "algorithmConfigVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entries" JSONB NOT NULL,
    "sourceEventMaxCreatedAt" TIMESTAMP(3),

    CONSTRAINT "LeaderboardSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "matchId" TEXT,
    "eventName" TEXT NOT NULL,
    "payload" JSONB,
    "consentScope" "ConsentScope",
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "matchId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_email_key" ON "UserAccount"("email");

-- CreateIndex
CREATE INDEX "UserAccount_status_idx" ON "UserAccount"("status");

-- CreateIndex
CREATE INDEX "UserAccount_createdAt_idx" ON "UserAccount"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_publicHandle_key" ON "UserProfile"("publicHandle");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_scope_recordedAt_idx" ON "ConsentRecord"("userId", "scope", "recordedAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_scope_decision_idx" ON "ConsentRecord"("scope", "decision");

-- CreateIndex
CREATE INDEX "DictionaryRelease_status_locale_wordLength_idx" ON "DictionaryRelease"("status", "locale", "wordLength");

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryRelease_locale_wordLength_version_key" ON "DictionaryRelease"("locale", "wordLength", "version");

-- CreateIndex
CREATE INDEX "DictionaryWord_dictionaryReleaseId_kind_idx" ON "DictionaryWord"("dictionaryReleaseId", "kind");

-- CreateIndex
CREATE INDEX "DictionaryWord_checksum_idx" ON "DictionaryWord"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryWord_dictionaryReleaseId_normalizedWord_kind_key" ON "DictionaryWord"("dictionaryReleaseId", "normalizedWord", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Lobby_code_key" ON "Lobby"("code");

-- CreateIndex
CREATE INDEX "Lobby_hostUserId_createdAt_idx" ON "Lobby"("hostUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Lobby_status_mode_idx" ON "Lobby"("status", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "Match_idempotencyKey_key" ON "Match"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Match_status_mode_createdAt_idx" ON "Match"("status", "mode", "createdAt");

-- CreateIndex
CREATE INDEX "Match_dictionaryReleaseId_idx" ON "Match"("dictionaryReleaseId");

-- CreateIndex
CREATE INDEX "MatchRound_dictionaryReleaseId_idx" ON "MatchRound"("dictionaryReleaseId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchRound_matchId_roundNumber_key" ON "MatchRound"("matchId", "roundNumber");

-- CreateIndex
CREATE INDEX "MatchParticipant_userId_joinedAt_idx" ON "MatchParticipant"("userId", "joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_matchId_userId_key" ON "MatchParticipant"("matchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_matchId_seatNumber_key" ON "MatchParticipant"("matchId", "seatNumber");

-- CreateIndex
CREATE UNIQUE INDEX "GuessAttempt_idempotencyKey_key" ON "GuessAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GuessAttempt_matchId_submittedAt_idx" ON "GuessAttempt"("matchId", "submittedAt");

-- CreateIndex
CREATE INDEX "GuessAttempt_dictionaryReleaseId_idx" ON "GuessAttempt"("dictionaryReleaseId");

-- CreateIndex
CREATE UNIQUE INDEX "GuessAttempt_roundId_participantId_attemptNumber_key" ON "GuessAttempt"("roundId", "participantId", "attemptNumber");

-- CreateIndex
CREATE INDEX "ScoreBreakdown_matchId_participantId_idx" ON "ScoreBreakdown"("matchId", "participantId");

-- CreateIndex
CREATE INDEX "ScoreBreakdown_category_idx" ON "ScoreBreakdown"("category");

-- CreateIndex
CREATE UNIQUE INDEX "MatchReport_matchId_key" ON "MatchReport"("matchId");

-- CreateIndex
CREATE INDEX "RatingProfile_mode_rating_idx" ON "RatingProfile"("mode", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "RatingProfile_userId_mode_algorithmConfigVersion_key" ON "RatingProfile"("userId", "mode", "algorithmConfigVersion");

-- CreateIndex
CREATE UNIQUE INDEX "RatingEvent_idempotencyKey_key" ON "RatingEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RatingEvent_ratingProfileId_createdAt_idx" ON "RatingEvent"("ratingProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "RatingEvent_matchId_idx" ON "RatingEvent"("matchId");

-- CreateIndex
CREATE INDEX "RatingEvent_voidedByEventId_idx" ON "RatingEvent"("voidedByEventId");

-- CreateIndex
CREATE INDEX "RatingEvent_reversalOfEventId_idx" ON "RatingEvent"("reversalOfEventId");

-- CreateIndex
CREATE INDEX "LeaderboardSnapshot_mode_algorithmConfigVersion_generatedAt_idx" ON "LeaderboardSnapshot"("mode", "algorithmConfigVersion", "generatedAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_eventName_occurredAt_idx" ON "AnalyticsEvent"("eventName", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_userId_occurredAt_idx" ON "AnalyticsEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_matchId_idx" ON "AnalyticsEvent"("matchId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictionaryWord" ADD CONSTRAINT "DictionaryWord_dictionaryReleaseId_fkey" FOREIGN KEY ("dictionaryReleaseId") REFERENCES "DictionaryRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "Lobby"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_dictionaryReleaseId_fkey" FOREIGN KEY ("dictionaryReleaseId") REFERENCES "DictionaryRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRound" ADD CONSTRAINT "MatchRound_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRound" ADD CONSTRAINT "MatchRound_dictionaryReleaseId_fkey" FOREIGN KEY ("dictionaryReleaseId") REFERENCES "DictionaryRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuessAttempt" ADD CONSTRAINT "GuessAttempt_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuessAttempt" ADD CONSTRAINT "GuessAttempt_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "MatchRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuessAttempt" ADD CONSTRAINT "GuessAttempt_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "MatchParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuessAttempt" ADD CONSTRAINT "GuessAttempt_dictionaryReleaseId_fkey" FOREIGN KEY ("dictionaryReleaseId") REFERENCES "DictionaryRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreBreakdown" ADD CONSTRAINT "ScoreBreakdown_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreBreakdown" ADD CONSTRAINT "ScoreBreakdown_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "MatchRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreBreakdown" ADD CONSTRAINT "ScoreBreakdown_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "MatchParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchReport" ADD CONSTRAINT "MatchReport_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingProfile" ADD CONSTRAINT "RatingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingEvent" ADD CONSTRAINT "RatingEvent_ratingProfileId_fkey" FOREIGN KEY ("ratingProfileId") REFERENCES "RatingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingEvent" ADD CONSTRAINT "RatingEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingEvent" ADD CONSTRAINT "RatingEvent_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "MatchParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

