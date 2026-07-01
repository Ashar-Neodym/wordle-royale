import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { buildLocalFixtureSeedPlan, buildSeedDryRunSummary } from './seed-fixtures.ts';

const knownFixtureWords = ['crane', 'slate', 'adieu', 'xxxxx'];

test('local fixture seed plan uses only the safe fixture dictionary policy', () => {
  const plan = buildLocalFixtureSeedPlan();

  assert.equal(plan.dictionaryRelease.locale, 'en');
  assert.equal(plan.dictionaryRelease.wordLength, 5);
  assert.equal(plan.dictionaryRelease.version, 'en-5-test-vfixture.001');
  assert.equal(plan.dictionaryRelease.status, 'draft');
  assert.equal(plan.dictionaryRelease.sourceLabel, 'safe-fixture');
  assert.equal(plan.dictionaryRelease.sourceMetadata.fixtureOnly, true);
  assert.equal(plan.dictionaryRelease.sourceMetadata.productionApproved, false);
  assert.match(plan.dictionaryRelease.sourceMetadata.sourcePolicy, /hand_curated_safe_fixture_only/);

  assert.equal(plan.dictionaryWords.filter((word) => word.kind === 'answer').length, plan.dictionaryRelease.answerCount);
  assert.equal(plan.dictionaryWords.filter((word) => word.kind === 'guess').length, plan.dictionaryRelease.guessCount);
  assert.equal(plan.dictionaryWords.filter((word) => word.kind === 'banned').length, plan.dictionaryRelease.bannedCount);
  assert.ok(plan.dictionaryWords.every((word) => word.metadata.sourceIds.includes('safe-fixture')));
  assert.ok(plan.users.every((user) => user.email === null));
});

test('seed dry-run summary is deterministic and spoiler-safe', () => {
  const first = buildSeedDryRunSummary(buildLocalFixtureSeedPlan());
  const second = buildSeedDryRunSummary(buildLocalFixtureSeedPlan());

  assert.deepEqual(first, second);
  assert.equal(first.mode, 'dry-run');
  assert.equal(first.dictionary.version, 'en-5-test-vfixture.001');
  assert.equal(first.dictionary.counts.answer, 20);
  assert.equal(first.dictionary.counts.guess, 40);
  assert.equal(first.dictionary.counts.banned, 3);
  assert.equal(first.dictionary.policy.fixtureOnly, true);
  assert.equal(first.dictionary.policy.productionApproved, false);
  assert.equal(first.users.count, buildLocalFixtureSeedPlan().users.length);
  assert.ok(first.users.handles.includes('player_one'));
  assert.ok(first.users.handles.includes('guest_player'));

  const serialized = JSON.stringify(first);
  for (const word of knownFixtureWords) {
    assert.doesNotMatch(serialized, new RegExp(`\\b${word}\\b`, 'i'), `dry-run summary leaked fixture word ${word}`);
  }
});

test('seed CLI dry-run emits JSON summary without requiring DATABASE_URL or a live database', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'prisma/seed-fixtures.ts', '--dry-run', '--json'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');

  const summary = JSON.parse(result.stdout);
  assert.equal(summary.mode, 'dry-run');
  assert.equal(summary.dictionary.version, 'en-5-test-vfixture.001');
  assert.equal(summary.dictionary.counts.totalWords, 63);
  assert.equal(summary.apply.available, false);
  assert.match(summary.apply.reason, /--apply/);

  for (const word of knownFixtureWords) {
    assert.doesNotMatch(result.stdout, new RegExp(`\\b${word}\\b`, 'i'), `CLI dry-run leaked fixture word ${word}`);
  }
});
