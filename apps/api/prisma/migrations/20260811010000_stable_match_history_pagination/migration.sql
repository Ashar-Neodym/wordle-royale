-- Additive indexes supporting participant lookup and deterministic history seeks.
CREATE INDEX "Match_createdAt_id_idx" ON "Match"("createdAt", "id");
CREATE INDEX "MatchParticipant_userId_matchId_idx" ON "MatchParticipant"("userId", "matchId");