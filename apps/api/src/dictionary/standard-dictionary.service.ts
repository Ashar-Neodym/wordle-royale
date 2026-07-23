import { Inject, Injectable } from '@nestjs/common';
import type { ReadinessDependency } from '@wordle-royale/contracts';
import {
  PREVIEW_DICTIONARY_ARTIFACT_SHA256,
  PREVIEW_DICTIONARY_COUNTS,
  PREVIEW_DICTIONARY_RELEASE_ID,
  PREVIEW_DICTIONARY_SOURCE_POLICY,
  PREVIEW_DICTIONARY_VERSION,
  buildPreviewDictionaryPlan,
} from '../../prisma/dictionary-fixture.ts';
import { PrismaService } from '../prisma/prisma.service.ts';

export type StandardDictionarySelection = {
  releaseId: string;
  version: string;
  policy: 'preview_fixture_exception' | 'production_approved';
  answerCount: number;
};

type ReleaseRecord = {
  id: string;
  locale: string;
  wordLength: number;
  version: string;
  status: string;
  sourceLabel: string;
  sourceMetadata: unknown;
  artifactSha256: string | null;
  answerCount: number;
  guessCount: number;
  bannedCount: number;
  releasedAt?: Date | string | null;
  createdAt?: Date | string;
};

type DictionaryCounts = { answer: number; guess: number; banned: number; total: number };

function metadata(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const expectedFixtureRelease = buildPreviewDictionaryPlan().dictionaryRelease;

function isValidated(meta: Record<string, any> | null): boolean {
  return meta?.validation?.passed === true;
}

function isProductionApproved(release: ReleaseRecord, counts: DictionaryCounts): boolean {
  const meta = metadata(release.sourceMetadata);
  return release.id !== PREVIEW_DICTIONARY_RELEASE_ID
    && release.version !== PREVIEW_DICTIONARY_VERSION
    && release.locale === 'en'
    && release.wordLength === 5
    && release.status === 'active'
    && meta?.fixtureOnly === false
    && meta?.productionApproved === true
    && isValidated(meta)
    && release.answerCount > 0
    && counts.answer > 0;
}

function isPreviewFixture(release: ReleaseRecord, counts: DictionaryCounts): boolean {
  const meta = metadata(release.sourceMetadata);
  return release.id === PREVIEW_DICTIONARY_RELEASE_ID
    && release.version === PREVIEW_DICTIONARY_VERSION
    && release.locale === 'en'
    && release.wordLength === 5
    && (release.status === 'draft' || release.status === 'active')
    && release.sourceLabel === expectedFixtureRelease.sourceLabel
    && release.artifactSha256 === PREVIEW_DICTIONARY_ARTIFACT_SHA256
    && release.answerCount === PREVIEW_DICTIONARY_COUNTS.answer
    && release.guessCount === PREVIEW_DICTIONARY_COUNTS.guess
    && release.bannedCount === PREVIEW_DICTIONARY_COUNTS.banned
    && meta?.fixtureOnly === true
    && meta?.productionApproved === false
    && meta?.sourcePolicy === PREVIEW_DICTIONARY_SOURCE_POLICY
    && isValidated(meta)
    && canonical(meta) === canonical(expectedFixtureRelease.sourceMetadata)
    && counts.answer === PREVIEW_DICTIONARY_COUNTS.answer
    && counts.guess === PREVIEW_DICTIONARY_COUNTS.guess
    && counts.banned === PREVIEW_DICTIONARY_COUNTS.banned
    && counts.total === PREVIEW_DICTIONARY_COUNTS.total;
}

export function resolvedAppEnv(): string {
  return process.env.APP_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'local');
}

@Injectable()
export class StandardDictionaryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async selectStandardDictionary(
    client: any = this.prisma.client,
    appEnv = resolvedAppEnv(),
    requiredReleaseId?: string,
  ): Promise<StandardDictionarySelection | null> {
    if (!['local', 'test', 'preview', 'production'].includes(appEnv)) return null;
    const releases = await client.dictionaryRelease.findMany({
      where: {
        locale: 'en',
        wordLength: 5,
        ...(requiredReleaseId ? { id: requiredReleaseId } : {}),
      },
      orderBy: [{ releasedAt: 'desc' }, { createdAt: 'desc' }],
    }) as ReleaseRecord[];

    const checked: Array<{ release: ReleaseRecord; counts: DictionaryCounts }> = [];
    for (const release of releases) {
      const groups = await client.dictionaryWord.groupBy({
        by: ['kind'],
        where: { dictionaryReleaseId: release.id },
        _count: { _all: true },
      }) as Array<{ kind: 'answer' | 'guess' | 'banned'; _count: { _all: number } }>;
      const countFor = (kind: 'answer' | 'guess' | 'banned') => groups.find((group) => group.kind === kind)?._count._all ?? 0;
      const answer = countFor('answer');
      const guess = countFor('guess');
      const banned = countFor('banned');
      checked.push({
        release,
        counts: { answer, guess, banned, total: answer + guess + banned },
      });
    }

    const production = checked.find(({ release, counts }) => isProductionApproved(release, counts));
    if (production) {
      return {
        releaseId: production.release.id,
        version: production.release.version,
        policy: 'production_approved',
        answerCount: production.counts.answer,
      };
    }
    if (appEnv === 'production') return null;

    const fixture = checked.find(({ release, counts }) => isPreviewFixture(release, counts));
    if (!fixture) return null;
    return {
      releaseId: fixture.release.id,
      version: fixture.release.version,
      policy: 'preview_fixture_exception',
      answerCount: fixture.counts.answer,
    };
  }

  async checkStandardDictionary(appEnv = resolvedAppEnv(), client: any = this.prisma.client): Promise<ReadinessDependency> {
    const checkedAt = new Date().toISOString();
    try {
      const selection = await this.selectStandardDictionary(client, appEnv);
      if (!selection) {
        return {
          status: 'unavailable',
          checkedAt,
          message: `No usable Standard dictionary is available for APP_ENV=${appEnv}. Run the reviewed preview dictionary bootstrap after approval.`,
        };
      }
      return {
        status: 'ok',
        checkedAt,
        message: `Standard dictionary is available for ${appEnv} matchmaking (version ${selection.version}; ${selection.answerCount} answers).`,
      };
    } catch {
      return {
        status: 'unavailable',
        checkedAt,
        message: `Standard dictionary availability could not be verified for APP_ENV=${appEnv}.`,
      };
    }
  }
}
