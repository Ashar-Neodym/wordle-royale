import test from 'node:test';
import assert from 'node:assert/strict';
import { wordListArtifactSchema, wordLibraryManifestSchema, validationReportSchema } from './schemas.ts';

test('word list artifact schema accepts fixture list metadata and words', () => {
  const artifact = wordListArtifactSchema.parse({
    listId: 'en-5-test-answer-vfixture.001',
    name: 'Fixture answers',
    type: 'answer',
    language: 'en',
    locale: 'en',
    wordLength: 5,
    version: 'vfixture.001',
    rankedEligible: false,
    status: 'draft',
    words: [{ text: 'crane', normalizedText: 'crane', difficultyTier: 'easy', difficultyScore: 10, sourceIds: ['safe-fixture'] }],
  });

  assert.equal(artifact.words[0]!.normalizedText, 'crane');
});

test('manifest schema requires deterministic list checksums', () => {
  const manifest = wordLibraryManifestSchema.parse({
    manifestVersion: 1,
    dictionaryVersion: 'en-5-test-vfixture.001',
    language: 'en',
    locale: 'en',
    wordLength: 5,
    policy: { fixtureOnly: true, productionApproved: false },
    lists: {
      answer: { listId: 'en-5-test-answer-vfixture.001', count: 1, checksumSha256: 'a'.repeat(64) },
      guess: { listId: 'en-5-test-guess-vfixture.001', count: 1, checksumSha256: 'b'.repeat(64) },
      banned: { listId: 'en-5-test-banned-vfixture.001', count: 0, checksumSha256: 'c'.repeat(64) },
    },
    sources: [{ sourceId: 'safe-fixture', licenseName: 'Project fixture', licenseReviewed: true }],
    validation: { passed: true, reportPath: 'packages/word-tools/data/reports/en-5-test-vfixture.001.validation-report.json' },
    createdAt: '2026-06-22T00:00:00.000Z',
  });

  assert.equal(manifest.lists.answer.checksumSha256.length, 64);
});

test('validation report schema exposes failed checks', () => {
  const report = validationReportSchema.parse({
    reportVersion: 1,
    dictionaryVersion: 'en-5-test-vfixture.001',
    generatedAt: '2026-06-22T00:00:00.000Z',
    passed: false,
    summary: { answerCount: 1, guessCount: 0, bannedCount: 0, errorCount: 1, warningCount: 0 },
    checks: [{ id: 'answers_in_guess_list', level: 'error', passed: false, message: 'Answer words missing from guess list: crane' }],
  });

  assert.equal(report.checks[0]!.id, 'answers_in_guess_list');
});
