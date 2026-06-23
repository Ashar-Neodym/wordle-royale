import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixtureArtifacts } from './fixtures.ts';

test('buildFixtureArtifacts creates deterministic fixtures and manifest checksums', () => {
  const first = buildFixtureArtifacts();
  const second = buildFixtureArtifacts();
  assert.deepEqual(first, second);
  assert.equal(first.validationReport.passed, true);
  assert.ok(first.answerArtifact.words.length >= 20);
  assert.ok(first.guessArtifact.words.length > first.answerArtifact.words.length);
  assert.equal(first.manifest.lists.answer.count, first.answerArtifact.words.length);
  assert.match(first.manifest.lists.answer.checksumSha256, /^[a-f0-9]{64}$/);
});

test('fixture guesses include every answer and banned placeholders stay separate', () => {
  const artifacts = buildFixtureArtifacts();
  const guesses = new Set(artifacts.guessArtifact.words.map((word) => word.normalizedText));
  const banned = new Set(artifacts.bannedArtifact.words.map((word) => word.normalizedText));
  for (const answer of artifacts.answerArtifact.words) assert.equal(guesses.has(answer.normalizedText), true);
  for (const word of [...guesses]) assert.equal(banned.has(word), false);
});
