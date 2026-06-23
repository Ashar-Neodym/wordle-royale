import { FIXTURE_DICTIONARY_VERSION, WORD_LIBRARY_REPORT_VERSION } from '@wordle-royale/contracts';
import { normalizeWord } from './normalize.ts';

type Lists = { answers: string[]; guesses: string[]; banned: string[] };
type Check = { id: string; level: 'error' | 'warning'; passed: boolean; message: string };

function duplicates(words: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const word of words) {
    if (seen.has(word)) dupes.add(word);
    seen.add(word);
  }
  return [...dupes].sort();
}

export function validateFixtureLists(lists: Lists) {
  const checks: Check[] = [];
  const all = [...lists.answers, ...lists.guesses, ...lists.banned];
  const invalid = all.filter((word) => !normalizeWord(word).ok).sort();
  checks.push({ id: 'word_length_and_ascii', level: 'error', passed: invalid.length === 0, message: invalid.length === 0 ? 'All fixture words are lowercase ASCII 5-letter words.' : `Invalid fixture words: ${invalid.join(', ')}` });

  const dupes = [...duplicates(lists.answers), ...duplicates(lists.guesses), ...duplicates(lists.banned)].sort();
  checks.push({ id: 'duplicate_words', level: 'error', passed: dupes.length === 0, message: dupes.length === 0 ? 'No duplicate words within fixture lists.' : `Duplicate words found: ${dupes.join(', ')}` });

  const guessSet = new Set(lists.guesses);
  const missingAnswers = lists.answers.filter((word) => !guessSet.has(word)).sort();
  checks.push({ id: 'answers_in_guess_list', level: 'error', passed: missingAnswers.length === 0, message: missingAnswers.length === 0 ? 'Every answer is valid as a guess.' : `Answer words missing from guess list: ${missingAnswers.join(', ')}` });

  const bannedSet = new Set(lists.banned);
  const conflicts = [...new Set([...lists.answers, ...lists.guesses].filter((word) => bannedSet.has(word)))].sort();
  checks.push({ id: 'banned_conflicts', level: 'error', passed: conflicts.length === 0, message: conflicts.length === 0 ? 'Banned placeholders do not overlap answer or guess fixtures.' : `Banned words conflict with allowed lists: ${conflicts.join(', ')}` });

  const errorCount = checks.filter((check) => check.level === 'error' && !check.passed).length;
  const warningCount = checks.filter((check) => check.level === 'warning' && !check.passed).length;
  return {
    reportVersion: WORD_LIBRARY_REPORT_VERSION,
    dictionaryVersion: FIXTURE_DICTIONARY_VERSION,
    generatedAt: '2026-06-22T00:00:00.000Z',
    passed: errorCount === 0,
    summary: { answerCount: lists.answers.length, guessCount: lists.guesses.length, bannedCount: lists.banned.length, errorCount, warningCount },
    checks,
  };
}
