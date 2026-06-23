import { FIXTURE_DICTIONARY_VERSION, FIXTURE_SOURCE_ID, wordLibraryManifestSchema, wordListArtifactSchema, validationReportSchema } from '@wordle-royale/contracts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Hex, stableStringify } from './checksum.ts';
import { hasDuplicateLetters } from './normalize.ts';
import { validateFixtureLists } from './validate.ts';

export const fixtureAnswers = ['crane','slate','flame','brave','crown','arena','plant','chair','light','sound','pride','bloom','level','civic','array','mamma','allee','knoll','press','model'];
export const fixtureExtraGuesses = ['adieu','roate','raise','stare','tears','rates','later','cigar','rebut','sissy','humph','awake','blush','focal','evade','naval','serve','heath','dwarf','karma'];
export const fixtureBanned = ['xxxxx','yyyyy','zzzzz'];

function difficulty(word: string): { difficultyTier: 'easy' | 'medium' | 'hard'; difficultyScore: number } {
  if (hasDuplicateLetters(word)) return { difficultyTier: 'hard', difficultyScore: 75 };
  if (/[jqxz]/.test(word)) return { difficultyTier: 'hard', difficultyScore: 70 };
  if (/[aeiou]/.test(word[0] ?? '')) return { difficultyTier: 'medium', difficultyScore: 45 };
  return { difficultyTier: 'easy', difficultyScore: 25 };
}

function artifactWord(word: string) {
  return { text: word, normalizedText: word, ...difficulty(word), sourceIds: [FIXTURE_SOURCE_ID], hasDuplicateLetters: hasDuplicateLetters(word) };
}

function makeArtifact(type: 'answer' | 'guess_valid' | 'banned', words: string[]) {
  const kind = type === 'guess_valid' ? 'guess' : type;
  return wordListArtifactSchema.parse({
    listId: `en-5-test-${kind}-vfixture.001`,
    name: `English 5-letter test ${kind} fixture`,
    type,
    language: 'en',
    locale: 'en',
    wordLength: 5,
    version: 'vfixture.001',
    rankedEligible: false,
    status: 'draft',
    words: [...words].sort().map(artifactWord),
  });
}

export function buildFixtureArtifacts() {
  const answers = [...fixtureAnswers].sort();
  const guesses = [...new Set([...fixtureAnswers, ...fixtureExtraGuesses])].sort();
  const banned = [...fixtureBanned].sort();
  const answerArtifact = makeArtifact('answer', answers);
  const guessArtifact = makeArtifact('guess_valid', guesses);
  const bannedArtifact = makeArtifact('banned', banned);
  const validationReport = validationReportSchema.parse(validateFixtureLists({ answers, guesses, banned }));
  const reportPath = 'packages/word-tools/data/reports/en-5-test-vfixture.001.validation-report.json';
  const manifest = wordLibraryManifestSchema.parse({
    manifestVersion: 1,
    dictionaryVersion: FIXTURE_DICTIONARY_VERSION,
    language: 'en',
    locale: 'en',
    wordLength: 5,
    policy: { fixtureOnly: true, productionApproved: false, sourcePolicy: 'hand_curated_safe_fixture_only' },
    lists: {
      answer: { listId: answerArtifact.listId, count: answerArtifact.words.length, checksumSha256: sha256Hex(answerArtifact) },
      guess: { listId: guessArtifact.listId, count: guessArtifact.words.length, checksumSha256: sha256Hex(guessArtifact) },
      banned: { listId: bannedArtifact.listId, count: bannedArtifact.words.length, checksumSha256: sha256Hex(bannedArtifact) },
    },
    sources: [{ sourceId: FIXTURE_SOURCE_ID, licenseName: 'Project hand-curated test fixture; not a production dictionary source', licenseReviewed: true }],
    validation: { passed: validationReport.passed, reportPath },
    createdAt: '2026-06-22T00:00:00.000Z',
  });
  return { answerArtifact, guessArtifact, bannedArtifact, manifest, validationReport };
}

export function writeFixtureArtifacts(outputDir: string, reportDir = 'packages/word-tools/data/reports') {
  const artifacts = buildFixtureArtifacts();
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(outputDir, 'en-5-test-answer-vfixture.001.json'), `${stableStringify(artifacts.answerArtifact)}
`);
  writeFileSync(join(outputDir, 'en-5-test-guess-vfixture.001.json'), `${stableStringify(artifacts.guessArtifact)}
`);
  writeFileSync(join(outputDir, 'en-5-test-banned-vfixture.001.json'), `${stableStringify(artifacts.bannedArtifact)}
`);
  writeFileSync(join(outputDir, 'manifest.fixture.json'), `${stableStringify(artifacts.manifest)}
`);
  writeFileSync(join(reportDir, 'en-5-test-vfixture.001.validation-report.json'), `${stableStringify(artifacts.validationReport)}
`);
  return artifacts;
}
