import {
  PREVIEW_DICTIONARY_CONFIRMATION,
  buildPreviewDictionaryPlan,
  buildPreviewDictionarySummary,
  validatePreviewDictionaryPlan,
} from './dictionary-fixture.ts';
import type { PreviewDictionaryPlan, SeedDictionaryWord } from './dictionary-fixture.ts';

export class PreviewDictionaryBootstrapError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
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

function releaseMatches(existing: any, expected: PreviewDictionaryPlan['dictionaryRelease']): boolean {
  return existing.id === expected.id
    && existing.locale === expected.locale
    && existing.wordLength === expected.wordLength
    && existing.version === expected.version
    && existing.status === expected.status
    && existing.sourceLabel === expected.sourceLabel
    && existing.artifactSha256 === expected.artifactSha256
    && existing.answerCount === expected.answerCount
    && existing.guessCount === expected.guessCount
    && existing.bannedCount === expected.bannedCount
    && canonical(existing.sourceMetadata) === canonical(expected.sourceMetadata);
}

function wordMatches(existing: any, expected: SeedDictionaryWord): boolean {
  return existing.id === expected.id
    && existing.dictionaryReleaseId === expected.dictionaryReleaseId
    && existing.normalizedWord === expected.normalizedWord
    && existing.kind === expected.kind
    && existing.checksum === expected.checksum
    && canonical(existing.metadata) === canonical(expected.metadata);
}

function assertExactWords(existingWords: any[], plan: PreviewDictionaryPlan, allowMissing: boolean): SeedDictionaryWord[] {
  const expectedByKey = new Map(plan.dictionaryWords.map((word) => [`${word.kind}:${word.normalizedWord}`, word]));
  const existingByKey = new Map<string, any>();
  for (const existing of existingWords) {
    const key = `${existing.kind}:${existing.normalizedWord}`;
    const expected = expectedByKey.get(key);
    if (!expected || existingByKey.has(key) || !wordMatches(existing, expected)) {
      throw new PreviewDictionaryBootstrapError('preview_dictionary_release_conflict');
    }
    existingByKey.set(key, existing);
  }
  const missing = plan.dictionaryWords.filter((word) => !existingByKey.has(`${word.kind}:${word.normalizedWord}`));
  if (!allowMissing && missing.length > 0) {
    throw new PreviewDictionaryBootstrapError('preview_dictionary_release_conflict');
  }
  return missing;
}

export async function applyPreviewDictionaryPlan(client: any, plan = buildPreviewDictionaryPlan()): Promise<'created' | 'unchanged'> {
  try {
    validatePreviewDictionaryPlan(plan);
  } catch {
    throw new PreviewDictionaryBootstrapError('preview_dictionary_plan_invalid');
  }

  try {
    return await client.$transaction(async (tx: any) => {
    let created = false;
    let release = await tx.dictionaryRelease.findUnique({
      where: {
        locale_wordLength_version: {
          locale: plan.dictionaryRelease.locale,
          wordLength: plan.dictionaryRelease.wordLength,
          version: plan.dictionaryRelease.version,
        },
      },
    });

    if (release && !releaseMatches(release, plan.dictionaryRelease)) {
      throw new PreviewDictionaryBootstrapError('preview_dictionary_release_conflict');
    }
    if (!release) {
      release = await tx.dictionaryRelease.create({ data: plan.dictionaryRelease });
      created = true;
    }

    const existingWords = await tx.dictionaryWord.findMany({ where: { dictionaryReleaseId: release.id } });
    const missingWords = assertExactWords(existingWords, plan, true);
    if (missingWords.length > 0) {
      await tx.dictionaryWord.createMany({ data: missingWords, skipDuplicates: false });
      created = true;
    }

    const finalWords = await tx.dictionaryWord.findMany({ where: { dictionaryReleaseId: release.id } });
    assertExactWords(finalWords, plan, false);
    if (finalWords.length !== plan.dictionaryWords.length) {
      throw new PreviewDictionaryBootstrapError('preview_dictionary_release_conflict');
    }
    return created ? 'created' : 'unchanged';
    });
  } catch (error) {
    if (error instanceof PreviewDictionaryBootstrapError) throw error;
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
      throw new PreviewDictionaryBootstrapError('preview_dictionary_release_conflict');
    }
    throw error;
  }
}

function assertApplyGuards(env: NodeJS.ProcessEnv): void {
  if (env.APP_ENV !== 'preview') {
    throw new PreviewDictionaryBootstrapError('preview_dictionary_wrong_environment');
  }
  if (env.PREVIEW_DICTIONARY_BOOTSTRAP_CONFIRM !== PREVIEW_DICTIONARY_CONFIRMATION) {
    throw new PreviewDictionaryBootstrapError('preview_dictionary_confirmation_required');
  }
  if (!env.DATABASE_URL) {
    throw new PreviewDictionaryBootstrapError('preview_dictionary_database_required');
  }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const shouldApply = args.has('--apply');
  const json = args.has('--json');
  const plan = buildPreviewDictionaryPlan();

  if (!shouldApply) {
    const summary = buildPreviewDictionarySummary(plan);
    console.log(json ? JSON.stringify(summary, null, 2) : [
      'Wordle Royale preview dictionary bootstrap dry-run',
      `releaseId=${summary.releaseId}`,
      `version=${summary.version}`,
      `status=${summary.status}`,
      `artifactSha256=${summary.artifactSha256}`,
      `counts answer=${summary.counts.answer} guess=${summary.counts.guess} banned=${summary.counts.banned} total=${summary.counts.total}`,
      `fixtureOnly=${summary.fixtureOnly}`,
      `productionApproved=${summary.productionApproved}`,
      `result=${summary.result}`,
    ].join('\n'));
    return;
  }

  assertApplyGuards(process.env);
  const prismaModule = await import('@prisma/client') as unknown as { PrismaClient: new () => any };
  const prisma = new prismaModule.PrismaClient();
  try {
    const result = await applyPreviewDictionaryPlan(prisma, plan);
    const summary = buildPreviewDictionarySummary(plan, 'apply', result);
    console.log(json ? JSON.stringify(summary, null, 2) : [
      `mode=${summary.mode}`,
      `releaseId=${summary.releaseId}`,
      `version=${summary.version}`,
      `status=${summary.status}`,
      `artifactSha256=${summary.artifactSha256}`,
      `counts answer=${summary.counts.answer} guess=${summary.counts.guess} banned=${summary.counts.banned} total=${summary.counts.total}`,
      `fixtureOnly=${summary.fixtureOnly}`,
      `productionApproved=${summary.productionApproved}`,
      `result=${summary.result}`,
    ].join('\n'));
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const code = error instanceof PreviewDictionaryBootstrapError ? error.code : 'preview_dictionary_apply_failed';
    console.error(code);
    process.exitCode = 1;
  });
}
