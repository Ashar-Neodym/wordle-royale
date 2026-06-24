import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const schema = readFileSync(join(import.meta.dirname, 'schema.prisma'), 'utf8');

function assertModel(name) {
  assert.match(schema, new RegExp(`model\\s+${name}\\s+\\{`), `missing model ${name}`);
}

function modelBody(name) {
  const match = schema.match(new RegExp(`model\\s+${name}\\s+\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `missing model body ${name}`);
  return match[1];
}

test('schema uses PostgreSQL provider and app env datasource', () => {
  assert.match(schema, /provider\s*=\s*"postgresql"/);
  assert.match(schema, /url\s*=\s*env\("DATABASE_URL"\)/);
});

test('schema covers users profiles consent and analytics audit basics', () => {
  for (const name of ['UserAccount', 'UserProfile', 'ConsentRecord', 'AnalyticsEvent', 'AuditLog']) {
    assertModel(name);
  }
  assert.match(modelBody('ConsentRecord'), /scope\s+ConsentScope/);
  assert.match(modelBody('AnalyticsEvent'), /payload\s+Json\?/);
});

test('schema stores dictionary versions and per-word metadata without production source content', () => {
  for (const name of ['DictionaryRelease', 'DictionaryWord']) {
    assertModel(name);
  }
  assert.match(modelBody('DictionaryRelease'), /version\s+String/);
  assert.match(modelBody('DictionaryWord'), /kind\s+DictionaryWordKind/);
  assert.match(modelBody('DictionaryWord'), /checksum\s+String\?/);
});

test('schema covers lobby match round participant guesses scores and reports', () => {
  for (const name of ['Lobby', 'Match', 'MatchRound', 'MatchParticipant', 'GuessAttempt', 'ScoreBreakdown', 'MatchReport']) {
    assertModel(name);
  }
  assert.match(modelBody('Match'), /dictionaryReleaseId\s+String/);
  assert.match(modelBody('MatchRound'), /answerWordHash\s+String/);
  assert.doesNotMatch(modelBody('MatchRound'), /answerWord\s+String/);
  assert.match(modelBody('GuessAttempt'), /feedback\s+Json/);
  assert.match(modelBody('GuessAttempt'), /serverValidation\s+Json/);
});

test('schema supports rating events idempotency voids reversals and leaderboard profiles', () => {
  for (const name of ['RatingProfile', 'RatingEvent', 'LeaderboardSnapshot']) {
    assertModel(name);
  }
  assert.match(modelBody('RatingEvent'), /idempotencyKey\s+String/);
  assert.match(modelBody('RatingEvent'), /voidedByEventId\s+String\?/);
  assert.match(modelBody('RatingEvent'), /reversalOfEventId\s+String\?/);
  assert.match(modelBody('RatingProfile'), /algorithmConfigVersion\s+String/);
});
