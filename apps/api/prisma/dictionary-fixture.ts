import { buildFixtureArtifacts } from '@wordle-royale/word-tools';
import { createHash } from 'node:crypto';

export const PREVIEW_DICTIONARY_RELEASE_ID = 'dict_en_5_test_vfixture_001';
export const PREVIEW_DICTIONARY_VERSION = 'en-5-test-vfixture.001';
export const PREVIEW_DICTIONARY_CONFIRMATION = 'APPLY_EN_5_TEST_VFIXTURE_001_TO_PREVIEW';
export const PREVIEW_DICTIONARY_SOURCE_POLICY = 'hand_curated_safe_fixture_only';
export const PREVIEW_DICTIONARY_ARTIFACT_SHA256 = '53afa01086e8f173f0ae57b02eb9c5f67675ff4fe807551758297dfcc8717120';
export const PREVIEW_DICTIONARY_COUNTS = { answer: 20, guess: 40, banned: 3, total: 63 } as const;

export type SeedDictionaryWordKind = 'answer' | 'guess' | 'banned';

export interface SeedDictionaryRelease {
  id: string;
  locale: string;
  wordLength: number;
  version: string;
  status: 'draft';
  sourceLabel: string;
  sourceMetadata: {
    fixtureOnly: true;
    productionApproved: false;
    sourcePolicy: string;
    sources: Array<{ sourceId: string; licenseName: string; licenseReviewed: boolean }>;
    validation: { passed: boolean; reportPath: string };
    generatedBy: string;
  };
  artifactSha256: string;
  answerCount: number;
  guessCount: number;
  bannedCount: number;
}

export interface SeedDictionaryWord {
  id: string;
  dictionaryReleaseId: string;
  normalizedWord: string;
  kind: SeedDictionaryWordKind;
  checksum: string;
  metadata: {
    fixtureOnly: true;
    sourceIds: string[];
    difficultyTier: 'easy' | 'medium' | 'hard' | 'expert';
    difficultyScore: number;
    hasDuplicateLetters: boolean;
  };
}

export interface PreviewDictionaryPlan {
  dictionaryRelease: SeedDictionaryRelease;
  dictionaryWords: SeedDictionaryWord[];
}

export interface PreviewDictionarySummary {
  mode: 'dry-run' | 'apply';
  releaseId: string;
  version: string;
  status: 'draft';
  artifactSha256: string;
  counts: { answer: number; guess: number; banned: number; total: number };
  fixtureOnly: true;
  productionApproved: false;
  result: 'planned' | 'created' | 'unchanged';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
}

function mapArtifactWords(
  dictionaryReleaseId: string,
  kind: SeedDictionaryWordKind,
  words: ReturnType<typeof buildFixtureArtifacts>['answerArtifact']['words'],
): SeedDictionaryWord[] {
  return words.map((word) => ({
    id: stableId('dict_word', `${dictionaryReleaseId}:${kind}:${word.normalizedText}`),
    dictionaryReleaseId,
    normalizedWord: word.normalizedText,
    kind,
    checksum: sha256({ dictionaryReleaseId, kind, normalizedWord: word.normalizedText }),
    metadata: {
      fixtureOnly: true,
      sourceIds: [...word.sourceIds].sort(),
      difficultyTier: word.difficultyTier,
      difficultyScore: word.difficultyScore,
      hasDuplicateLetters: word.hasDuplicateLetters ?? false,
    },
  }));
}

export function buildPreviewDictionaryPlan(): PreviewDictionaryPlan {
  const { answerArtifact, guessArtifact, bannedArtifact, manifest } = buildFixtureArtifacts();
  const dictionaryReleaseId = `dict_${manifest.dictionaryVersion.replace(/[^a-z0-9]+/gi, '_')}`;
  const dictionaryRelease: SeedDictionaryRelease = {
    id: dictionaryReleaseId,
    locale: manifest.locale,
    wordLength: manifest.wordLength,
    version: manifest.dictionaryVersion,
    status: 'draft',
    sourceLabel: manifest.sources[0]?.sourceId ?? 'safe-fixture',
    sourceMetadata: {
      fixtureOnly: true,
      productionApproved: false,
      sourcePolicy: String(manifest.policy.sourcePolicy),
      sources: manifest.sources,
      validation: manifest.validation,
      generatedBy: 'apps/api/prisma/seed-fixtures.ts',
    },
    artifactSha256: sha256({ answer: manifest.lists.answer, guess: manifest.lists.guess, banned: manifest.lists.banned }),
    answerCount: manifest.lists.answer.count,
    guessCount: manifest.lists.guess.count,
    bannedCount: manifest.lists.banned.count,
  };
  const dictionaryWords = [
    ...mapArtifactWords(dictionaryReleaseId, 'answer', answerArtifact.words),
    ...mapArtifactWords(dictionaryReleaseId, 'guess', guessArtifact.words),
    ...mapArtifactWords(dictionaryReleaseId, 'banned', bannedArtifact.words),
  ];
  const plan = { dictionaryRelease, dictionaryWords };
  validatePreviewDictionaryPlan(plan);
  return plan;
}

export function validatePreviewDictionaryPlan(plan: PreviewDictionaryPlan): void {
  const release = plan.dictionaryRelease;
  const invalidRelease = release.id !== PREVIEW_DICTIONARY_RELEASE_ID
    || release.locale !== 'en'
    || release.wordLength !== 5
    || release.version !== PREVIEW_DICTIONARY_VERSION
    || release.status !== 'draft'
    || release.artifactSha256 !== PREVIEW_DICTIONARY_ARTIFACT_SHA256
    || release.answerCount !== PREVIEW_DICTIONARY_COUNTS.answer
    || release.guessCount !== PREVIEW_DICTIONARY_COUNTS.guess
    || release.bannedCount !== PREVIEW_DICTIONARY_COUNTS.banned
    || release.sourceMetadata.fixtureOnly !== true
    || release.sourceMetadata.productionApproved !== false
    || release.sourceMetadata.sourcePolicy !== PREVIEW_DICTIONARY_SOURCE_POLICY
    || release.sourceMetadata.validation?.passed !== true;
  if (invalidRelease) throw new Error('preview_dictionary_plan_invalid');

  const counts = { answer: 0, guess: 0, banned: 0 };
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const word of plan.dictionaryWords) {
    if (word.dictionaryReleaseId !== release.id || !/^[a-z]{5}$/.test(word.normalizedWord)) {
      throw new Error('preview_dictionary_plan_invalid');
    }
    const expectedId = stableId('dict_word', `${release.id}:${word.kind}:${word.normalizedWord}`);
    const expectedChecksum = sha256({ dictionaryReleaseId: release.id, kind: word.kind, normalizedWord: word.normalizedWord });
    if (word.id !== expectedId || word.checksum !== expectedChecksum || word.metadata.fixtureOnly !== true) {
      throw new Error('preview_dictionary_plan_invalid');
    }
    ids.add(word.id);
    keys.add(`${word.dictionaryReleaseId}:${word.kind}:${word.normalizedWord}`);
    counts[word.kind] += 1;
  }
  if (plan.dictionaryWords.length !== PREVIEW_DICTIONARY_COUNTS.total
    || ids.size !== PREVIEW_DICTIONARY_COUNTS.total
    || keys.size !== PREVIEW_DICTIONARY_COUNTS.total
    || counts.answer !== PREVIEW_DICTIONARY_COUNTS.answer
    || counts.guess !== PREVIEW_DICTIONARY_COUNTS.guess
    || counts.banned !== PREVIEW_DICTIONARY_COUNTS.banned) {
    throw new Error('preview_dictionary_plan_invalid');
  }
}

export function buildPreviewDictionarySummary(
  plan = buildPreviewDictionaryPlan(),
  mode: 'dry-run' | 'apply' = 'dry-run',
  result: 'planned' | 'created' | 'unchanged' = 'planned',
): PreviewDictionarySummary {
  validatePreviewDictionaryPlan(plan);
  return {
    mode,
    releaseId: plan.dictionaryRelease.id,
    version: plan.dictionaryRelease.version,
    status: plan.dictionaryRelease.status,
    artifactSha256: plan.dictionaryRelease.artifactSha256,
    counts: {
      answer: plan.dictionaryRelease.answerCount,
      guess: plan.dictionaryRelease.guessCount,
      banned: plan.dictionaryRelease.bannedCount,
      total: plan.dictionaryWords.length,
    },
    fixtureOnly: true,
    productionApproved: false,
    result,
  };
}
