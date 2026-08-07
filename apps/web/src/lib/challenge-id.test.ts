import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CURATED_ANSWERS_V1 } from './curated-answer-pools.ts';
import { PRACTICE_ANSWERS } from './practice-game.ts';
import {
  CHALLENGE_RANDOM_ATTEMPT_LIMIT,
  canonicalizeChallengeId,
  createChallengeId,
  decodeChallengeId,
  formatChallengeId,
  parseChallengeId,
} from './challenge-id.ts';

const VECTORS = [
  [0x00000000, 'c01-00000000-62'],
  [0x00000001, 'c01-00000001-65'],
  [0x0000002b, 'c01-0000002b-b3'],
  [0x0000002c, 'c01-0000002c-a6'],
  [0x12345678, 'c01-12345678-7e'],
  [0xffffffff, 'c01-ffffffff-bc'],
] as const;

function randomSequence(...values: number[]): (array: Uint32Array) => Uint32Array {
  let index = 0;
  return (array) => {
    array[0] = values[index++] ?? values.at(-1) ?? 0;
    return array;
  };
}

describe('V1 challenge identifiers', () => {
  it('matches every CRC-8/ATM architecture golden vector and emits canonical IDs', () => {
    for (const [nonce, id] of VECTORS) {
      assert.equal(formatChallengeId(nonce), id);
      assert.deepEqual(parseChallengeId(id), decodeChallengeId(id));
      const decoded = parseChallengeId(id);
      assert.equal(decoded.ok, true);
      if (decoded.ok) assert.equal(decoded.challengeId, id);
    }
  });

  it('freezes the exact historical 44-answer order and keeps Practice as the same alias', () => {
    assert.equal(CURATED_ANSWERS_V1, PRACTICE_ANSWERS);
    assert.deepEqual(CURATED_ANSWERS_V1, [
      'allee', 'arena', 'array', 'bloom', 'brave', 'chair', 'civic', 'crane',
      'crown', 'flame', 'knoll', 'level', 'light', 'mamma', 'model', 'plant',
      'press', 'pride', 'slate', 'sound', 'apple', 'beach', 'bread', 'cloud',
      'dance', 'dream', 'earth', 'field', 'grape', 'green', 'house', 'lemon',
      'music', 'ocean', 'peach', 'river', 'smile', 'stone', 'table', 'tiger',
      'train', 'water', 'world', 'youth',
    ]);
  });

  it('addresses every frozen answer exactly by nonces 0 through 43', () => {
    for (let nonce = 0; nonce < CURATED_ANSWERS_V1.length; nonce += 1) {
      const decoded = parseChallengeId(formatChallengeId(nonce));
      assert.equal(decoded.ok, true);
      if (decoded.ok) {
        assert.equal(decoded.answerIndex, nonce);
        assert.equal(decoded.answer, CURATED_ANSWERS_V1[nonce]);
      }
    }
  });

  it('maps later nonces modulo 44', () => {
    const decoded = parseChallengeId(formatChallengeId(44));
    assert.equal(decoded.ok, true);
    if (decoded.ok) assert.deepEqual([decoded.answerIndex, decoded.answer], [0, 'allee']);
  });

  it('rejects case, whitespace, separators, widths, and non-hex input as malformed without an answer', () => {
    for (const value of [null, '', ' c01-00000000-62', 'C01-00000000-62', 'c01-00000000-62\n',
      'c1-00000000-62', 'c01-0000000-62', 'c01_00000000_62', 'c01-0000000g-62']) {
      assert.deepEqual(parseChallengeId(value), { ok: false, reason: 'malformed' });
      assert.equal('answer' in parseChallengeId(value), false);
    }
  });

  it('checks mutations before version support and exposes no answer on failures', () => {
    const checksumFailure = parseChallengeId('c02-00000000-00');
    assert.deepEqual(checksumFailure, { ok: false, reason: 'checksum_mismatch' });
    assert.equal('answer' in checksumFailure, false);
    const unsupported = parseChallengeId('c02-00000000-c4');
    assert.deepEqual(unsupported, { ok: false, reason: 'unsupported_version' });
    assert.equal('answer' in unsupported, false);
    assert.deepEqual(parseChallengeId('c01-00000001-64'), { ok: false, reason: 'checksum_mismatch' });
  });

  it('canonicalizes only exact supported IDs for answer-free open-link validation', () => {
    assert.equal(canonicalizeChallengeId('c01-00000000-62'), 'c01-00000000-62');
    for (const value of [' c01-00000000-62', 'c01-00000000-00', 'c02-00000000-c4', null]) {
      assert.equal(canonicalizeChallengeId(value), null);
    }
  });

  it('creates IDs with injected cryptographic values and rejects the biased tail', () => {
    let calls = 0;
    const id = createChallengeId((array) => {
      calls += 1;
      array[0] = calls === 1 ? 0xffffffff : 43;
      return array;
    });
    assert.equal(id, 'c01-0000002b-b3');
    assert.equal(calls, 2);
  });

  it('propagates cryptographic provider failure and bounds perpetual rejection', () => {
    assert.throws(() => createChallengeId(() => { throw new DOMException('blocked', 'SecurityError'); }), /blocked/);
    let calls = 0;
    assert.throws(() => createChallengeId((array) => {
      calls += 1;
      array[0] = 0xffffffff;
      return array;
    }), /unbiased challenge nonce/);
    assert.equal(calls, CHALLENGE_RANDOM_ATTEMPT_LIMIT);
    assert.throws(() => createChallengeId(undefined as never), /required/);
  });

  it('does not retain a rejected value in the shared random buffer', () => {
    assert.equal(createChallengeId(randomSequence(0xfffffffc, 1)), 'c01-00000001-65');
  });

  it('rejects out-of-range formatter inputs rather than truncating', () => {
    for (const nonce of [-1, 0x1_0000_0000, 1.5, Number.NaN]) {
      assert.throws(() => formatChallengeId(nonce), RangeError);
    }
  });
});
