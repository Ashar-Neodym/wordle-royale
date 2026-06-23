import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFixtureLists } from './validate.ts';

test('validateFixtureLists passes safe separated fixture lists', () => {
  const report = validateFixtureLists({ answers: ['crane', 'level'], guesses: ['crane', 'level', 'adieu'], banned: ['xxxxx'] });
  assert.equal(report.passed, true);
  assert.equal(report.summary.errorCount, 0);
});

test('validateFixtureLists catches length duplicate separation and banned conflicts', () => {
  const report = validateFixtureLists({ answers: ['crane', 'crane', 'four'], guesses: ['crane', 'xxxxx'], banned: ['xxxxx'] });
  assert.equal(report.passed, false);
  assert.match(report.checks.map((check) => check.id).join(','), /word_length/);
  assert.match(report.checks.map((check) => check.id).join(','), /duplicate_words/);
  assert.match(report.checks.map((check) => check.id).join(','), /answers_in_guess_list/);
  assert.match(report.checks.map((check) => check.id).join(','), /banned_conflicts/);
});
