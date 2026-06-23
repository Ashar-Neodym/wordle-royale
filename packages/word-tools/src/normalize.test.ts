import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWord } from './normalize.ts';

test('normalizeWord lowercases valid 5-letter ASCII input', () => {
  assert.deepEqual(normalizeWord(' CRANE '), { ok: true, normalizedText: 'crane' });
});

test('normalizeWord rejects punctuation digits invalid length and non-ASCII', () => {
  assert.equal(normalizeWord("can't").ok, false);
  assert.equal(normalizeWord('abc1d').ok, false);
  assert.equal(normalizeWord('four').ok, false);
  assert.equal(normalizeWord('sixsix').ok, false);
  assert.equal(normalizeWord('caféé').ok, false);
});
