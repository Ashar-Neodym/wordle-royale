import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPreviewDictionaryPlan } from '../prisma/dictionary-fixture.ts';
import { StandardDictionaryService } from '../src/dictionary/standard-dictionary.service.ts';

function createClient(releases: any[], wordsByRelease: Map<string, Array<{ kind: string }>>) {
  return {
    dictionaryRelease: {
      findMany: async ({ where }: any) => releases.filter((release) => release.locale === where.locale
        && release.wordLength === where.wordLength
        && (!where.id || release.id === where.id)),
    },
    dictionaryWord: {
      groupBy: async ({ where }: any) => {
        const rows = wordsByRelease.get(where.dictionaryReleaseId) ?? [];
        return ['answer', 'guess', 'banned']
          .map((kind) => ({ kind, _count: { _all: rows.filter((row) => row.kind === kind).length } }))
          .filter((group) => group._count._all > 0);
      },
    },
  };
}

function previewFixture() {
  const plan = buildPreviewDictionaryPlan();
  return {
    release: { ...plan.dictionaryRelease, createdAt: new Date(), releasedAt: null },
    words: plan.dictionaryWords.map((word) => ({ kind: word.kind })),
  };
}

function productionRelease(id = 'production-dictionary') {
  return {
    id,
    locale: 'en',
    wordLength: 5,
    version: `prod-${id}`,
    status: 'active',
    sourceMetadata: { fixtureOnly: false, productionApproved: true, validation: { passed: true } },
    artifactSha256: 'a'.repeat(64),
    answerCount: 1,
    guessCount: 0,
    bannedCount: 0,
    releasedAt: new Date(),
    createdAt: new Date(),
  };
}

describe('StandardDictionaryService policy', () => {
  it('accepts only the exact validated fixture exception in preview and local/test', async () => {
    const fixture = previewFixture();
    const client = createClient([fixture.release], new Map([[fixture.release.id, fixture.words]]));
    const service = new StandardDictionaryService({ client } as any);

    assert.equal((await service.selectStandardDictionary(client, 'preview'))?.policy, 'preview_fixture_exception');
    assert.equal((await service.selectStandardDictionary(client, 'local'))?.releaseId, fixture.release.id);
    assert.equal((await service.selectStandardDictionary(client, 'test'))?.releaseId, fixture.release.id);

    fixture.release.artifactSha256 = '0'.repeat(64);
    assert.equal(await service.selectStandardDictionary(client, 'preview'), null);
  });

  it('rejects arbitrary drafts and fails closed for unknown environments', async () => {
    const release = { ...productionRelease('draft-lookalike'), status: 'draft' };
    const client = createClient([release], new Map([[release.id, [{ kind: 'answer' }]]]));
    const service = new StandardDictionaryService({ client } as any);
    assert.equal(await service.selectStandardDictionary(client, 'preview'), null);
    assert.equal(await service.selectStandardDictionary(client, 'staging'), null);
  });

  it('prefers production-approved active content in preview and accepts it in production', async () => {
    const fixture = previewFixture();
    const production = productionRelease();
    const client = createClient(
      [production, fixture.release],
      new Map([[production.id, [{ kind: 'answer' }]], [fixture.release.id, fixture.words]]),
    );
    const service = new StandardDictionaryService({ client } as any);
    assert.equal((await service.selectStandardDictionary(client, 'preview'))?.releaseId, production.id);
    assert.equal((await service.selectStandardDictionary(client, 'production'))?.policy, 'production_approved');
  });

  it('rejects the fixture in production even if its status and policy flags are altered', async () => {
    const fixture: any = previewFixture();
    fixture.release.status = 'active';
    fixture.release.sourceMetadata = {
      ...fixture.release.sourceMetadata,
      fixtureOnly: false,
      productionApproved: true,
    } as any;
    const client = createClient([fixture.release], new Map([[fixture.release.id, fixture.words]]));
    const service = new StandardDictionaryService({ client } as any);
    assert.equal(await service.selectStandardDictionary(client, 'production'), null);
  });

  it('requires actual answer rows and revalidates the originally selected release ID', async () => {
    const first = productionRelease('first');
    const second = productionRelease('second');
    const rows = new Map([[first.id, [{ kind: 'answer' }]], [second.id, [{ kind: 'answer' }]]]);
    const client = createClient([first, second], rows);
    const service = new StandardDictionaryService({ client } as any);
    assert.equal((await service.selectStandardDictionary(client, 'production', first.id))?.releaseId, first.id);
    rows.set(first.id, []);
    assert.equal(await service.selectStandardDictionary(client, 'production', first.id), null);
  });
});
