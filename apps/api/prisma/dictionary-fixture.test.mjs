import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  PREVIEW_DICTIONARY_ARTIFACT_SHA256,
  PREVIEW_DICTIONARY_CONFIRMATION,
  buildPreviewDictionaryPlan,
  buildPreviewDictionarySummary,
  validatePreviewDictionaryPlan,
} from './dictionary-fixture.ts';
import { applyPreviewDictionaryPlan } from './bootstrap-preview-dictionary.ts';

const apiRoot = new URL('..', import.meta.url);
const knownFixtureWords = ['crane', 'slate', 'adieu', 'xxxxx'];

function runCli(args, overrides = {}) {
  const env = { ...process.env, ...overrides };
  for (const key of ['APP_ENV', 'DATABASE_URL', 'PREVIEW_DICTIONARY_BOOTSTRAP_CONFIRM']) {
    if (overrides[key] === null) delete env[key];
  }
  return spawnSync(process.execPath, ['--import', 'tsx', 'prisma/bootstrap-preview-dictionary.ts', ...args], {
    cwd: apiRoot,
    encoding: 'utf8',
    env,
  });
}

test('preview dictionary plan locks exact approved identity, metadata, checksums, and counts', () => {
  const first = buildPreviewDictionaryPlan();
  const second = buildPreviewDictionaryPlan();
  validatePreviewDictionaryPlan(first);
  assert.deepEqual(first, second);
  assert.equal(first.dictionaryRelease.id, 'dict_en_5_test_vfixture_001');
  assert.equal(first.dictionaryRelease.artifactSha256, PREVIEW_DICTIONARY_ARTIFACT_SHA256);
  assert.equal(first.dictionaryRelease.sourceMetadata.fixtureOnly, true);
  assert.equal(first.dictionaryRelease.sourceMetadata.productionApproved, false);
  assert.equal(first.dictionaryRelease.sourceMetadata.validation.passed, true);
  assert.equal(first.dictionaryWords.length, 63);
  assert.deepEqual(
    Object.fromEntries(['answer', 'guess', 'banned'].map((kind) => [kind, first.dictionaryWords.filter((word) => word.kind === kind).length])),
    { answer: 20, guess: 40, banned: 3 },
  );
  assert.equal(new Set(first.dictionaryWords.map((word) => word.id)).size, 63);
});

test('preview dictionary plan validator fails closed on immutable or row conflicts', () => {
  const changedHash = structuredClone(buildPreviewDictionaryPlan());
  changedHash.dictionaryRelease.artifactSha256 = '0'.repeat(64);
  assert.throws(() => validatePreviewDictionaryPlan(changedHash), /preview_dictionary_plan_invalid/);

  const changedWord = structuredClone(buildPreviewDictionaryPlan());
  changedWord.dictionaryWords[0].checksum = '0'.repeat(64);
  assert.throws(() => validatePreviewDictionaryPlan(changedWord), /preview_dictionary_plan_invalid/);

  const missingWord = structuredClone(buildPreviewDictionaryPlan());
  missingWord.dictionaryWords.pop();
  assert.throws(() => validatePreviewDictionaryPlan(missingWord), /preview_dictionary_plan_invalid/);
});

test('preview dictionary dry-run is database-free and spoiler-safe', () => {
  const result = runCli(['--dry-run', '--json'], {
    APP_ENV: null,
    DATABASE_URL: 'postgresql://credential-sentinel@127.0.0.1:1/unreachable',
    PREVIEW_DICTIONARY_BOOTSTRAP_CONFIRM: null,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary, buildPreviewDictionarySummary());
  assert.equal(summary.result, 'planned');
  assert.doesNotMatch(result.stdout, /credential-sentinel/);
  for (const word of knownFixtureWords) assert.doesNotMatch(result.stdout, new RegExp(`\\b${word}\\b`, 'i'));
});

test('preview dictionary apply guards fail closed with stable sanitized codes', () => {
  const wrongEnvironment = runCli(['--apply'], {
    APP_ENV: 'production',
    DATABASE_URL: 'postgresql://credential-sentinel@127.0.0.1:1/unreachable',
    PREVIEW_DICTIONARY_BOOTSTRAP_CONFIRM: PREVIEW_DICTIONARY_CONFIRMATION,
  });
  assert.equal(wrongEnvironment.status, 1);
  assert.equal(wrongEnvironment.stderr.trim(), 'preview_dictionary_wrong_environment');

  const missingConfirmation = runCli(['--apply'], {
    APP_ENV: 'preview',
    DATABASE_URL: 'postgresql://credential-sentinel@127.0.0.1:1/unreachable',
    PREVIEW_DICTIONARY_BOOTSTRAP_CONFIRM: null,
  });
  assert.equal(missingConfirmation.status, 1);
  assert.equal(missingConfirmation.stderr.trim(), 'preview_dictionary_confirmation_required');

  const missingDatabase = runCli(['--apply'], {
    APP_ENV: 'preview',
    DATABASE_URL: null,
    PREVIEW_DICTIONARY_BOOTSTRAP_CONFIRM: PREVIEW_DICTIONARY_CONFIRMATION,
  });
  assert.equal(missingDatabase.status, 1);
  assert.equal(missingDatabase.stderr.trim(), 'preview_dictionary_database_required');
});

test('dictionary-only apply is exact and idempotent without accessing identity or gameplay delegates', async () => {
  const releases = [];
  const words = [];
  const forbidden = new Proxy({}, { get() { throw new Error('forbidden delegate accessed'); } });
  const tx = {
    dictionaryRelease: {
      findUnique: async () => releases[0] ?? null,
      create: async ({ data }) => { const row = structuredClone(data); releases.push(row); return row; },
    },
    dictionaryWord: {
      findMany: async () => structuredClone(words),
      createMany: async ({ data }) => { words.push(...structuredClone(data)); return { count: data.length }; },
    },
    userAccount: forbidden,
    userProfile: forbidden,
    ratingProfile: forbidden,
    lobby: forbidden,
    match: forbidden,
    matchmakingTicket: forbidden,
    auditLog: forbidden,
  };
  const client = { $transaction: async (callback) => await callback(tx) };

  assert.equal(await applyPreviewDictionaryPlan(client), 'created');
  assert.equal(releases.length, 1);
  assert.equal(words.length, 63);
  assert.equal(await applyPreviewDictionaryPlan(client), 'unchanged');
  assert.equal(releases.length, 1);
  assert.equal(words.length, 63);
});

test('dictionary-only apply rejects existing release and word conflicts without mutation', async () => {
  const plan = buildPreviewDictionaryPlan();
  const releases = [{ ...structuredClone(plan.dictionaryRelease), artifactSha256: '0'.repeat(64) }];
  const words = structuredClone(plan.dictionaryWords);
  const tx = {
    dictionaryRelease: {
      findUnique: async () => releases[0],
      create: async () => { throw new Error('must not create'); },
    },
    dictionaryWord: {
      findMany: async () => structuredClone(words),
      createMany: async () => { throw new Error('must not create'); },
    },
  };
  const client = { $transaction: async (callback) => await callback(tx) };
  await assert.rejects(() => applyPreviewDictionaryPlan(client), /preview_dictionary_release_conflict/);
  assert.equal(releases.length, 1);
  assert.equal(words.length, 63);

  releases[0] = structuredClone(plan.dictionaryRelease);
  words.push({ ...structuredClone(words[0]), id: 'unexpected', normalizedWord: 'zzzzz' });
  await assert.rejects(() => applyPreviewDictionaryPlan(client), /preview_dictionary_release_conflict/);
  assert.equal(words.length, 64);
});
