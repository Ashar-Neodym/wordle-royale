-- CreateEnum
CREATE TYPE "RankedMode" AS ENUM ('standard_1v1', 'speed_1v1', 'classic_1v1', 'multiplayer_lobby');

-- RatingProfile mode migration: existing ranked rows become the primary Standard ladder.
DROP INDEX IF EXISTS "RatingProfile_userId_mode_algorithmConfigVersion_key";
DROP INDEX IF EXISTS "RatingProfile_mode_rating_idx";
ALTER TABLE "RatingProfile" ALTER COLUMN "mode" DROP DEFAULT;
ALTER TABLE "RatingProfile" ALTER COLUMN "mode" TYPE "RankedMode" USING (
  CASE
    WHEN "mode"::text = 'ranked' THEN 'standard_1v1'
    ELSE 'standard_1v1'
  END
)::"RankedMode";
ALTER TABLE "RatingProfile" ALTER COLUMN "mode" SET DEFAULT 'standard_1v1';
ALTER TABLE "RatingProfile" ADD COLUMN "wins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RatingProfile" ADD COLUMN "losses" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RatingProfile" ADD COLUMN "draws" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RatingProfile" ADD COLUMN "abandons" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RatingProfile" ADD COLUMN "peakRating" INTEGER NOT NULL DEFAULT 1500;
UPDATE "RatingProfile" SET "peakRating" = GREATEST("rating", 1500);
ALTER TABLE "RatingProfile" ADD COLUMN "ratingDeviation" DOUBLE PRECISION NOT NULL DEFAULT 350;
ALTER TABLE "RatingProfile" ADD COLUMN "ratingVolatility" DOUBLE PRECISION;
ALTER TABLE "RatingProfile" ADD COLUMN "lastRatedAt" TIMESTAMP(3);
CREATE INDEX "RatingProfile_mode_rating_idx" ON "RatingProfile"("mode", "rating");
CREATE UNIQUE INDEX "RatingProfile_userId_mode_algorithmConfigVersion_key" ON "RatingProfile"("userId", "mode", "algorithmConfigVersion");

-- Leaderboard snapshots are also per ranked mode.
DROP INDEX IF EXISTS "LeaderboardSnapshot_mode_algorithmConfigVersion_generatedAt_idx";
ALTER TABLE "LeaderboardSnapshot" ALTER COLUMN "mode" DROP DEFAULT;
ALTER TABLE "LeaderboardSnapshot" ALTER COLUMN "mode" TYPE "RankedMode" USING (
  CASE
    WHEN "mode"::text = 'ranked' THEN 'standard_1v1'
    ELSE 'standard_1v1'
  END
)::"RankedMode";
ALTER TABLE "LeaderboardSnapshot" ALTER COLUMN "mode" SET DEFAULT 'standard_1v1';
CREATE INDEX "LeaderboardSnapshot_mode_algorithmConfigVersion_generatedAt_idx" ON "LeaderboardSnapshot"("mode", "algorithmConfigVersion", "generatedAt");
