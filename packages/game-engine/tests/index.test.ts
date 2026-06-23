import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  calculateFinalStandings,
  calculatePlacementMmrDeltas,
  calculateRoundScore,
  compareForStandings,
  dictionaryFrom,
  isSolved,
  normalizeWord,
  scoreGuess,
  validateGuess,
} from '../src/index.ts';

const states = (answer: string, guess: string): string => scoreGuess(answer, guess).map((cell) => cell.state[0]?.toUpperCase()).join(' ');

describe('normalizeWord', () => {
  it('trims and lowercases input', () => {
    assert.equal(normalizeWord('  CrAnE  '), 'crane');
  });
});

describe('validateGuess', () => {
  const validGuesses = dictionaryFrom(['crane', 'apple', 'allee']);
  const bannedWords = dictionaryFrom(['slurs']);

  it('accepts a dictionary-valid normalized 5-letter word', () => {
    assert.deepEqual(validateGuess({ guess: ' CRANE ', validGuesses, bannedWords }), { valid: true, normalized: 'crane' });
  });

  it('rejects wrong length guesses', () => {
    assert.deepEqual(validateGuess({ guess: 'toolong', validGuesses }), { valid: false, normalized: 'toolong', reason: 'wrong_length' });
  });

  it('rejects non-ascii alphabetic guesses for English V1', () => {
    assert.deepEqual(validateGuess({ guess: 'cr4ne', validGuesses }), { valid: false, normalized: 'cr4ne', reason: 'invalid_characters' });
  });

  it('rejects banned words before dictionary membership succeeds', () => {
    assert.deepEqual(validateGuess({ guess: 'slurs', validGuesses: dictionaryFrom(['slurs']), bannedWords }), {
      valid: false,
      normalized: 'slurs',
      reason: 'banned_word',
    });
  });

  it('rejects words not in the active valid-guess dictionary', () => {
    assert.deepEqual(validateGuess({ guess: 'zzzzz', validGuesses }), { valid: false, normalized: 'zzzzz', reason: 'not_in_dictionary' });
  });
});

describe('scoreGuess duplicate-letter feedback', () => {
  it('marks an exact solve all correct', () => {
    const feedback = scoreGuess('crane', 'crane');
    assert.equal(states('crane', 'crane'), 'C C C C C');
    assert.equal(isSolved(feedback), true);
  });

  it('uses exact matches before present matches', () => {
    assert.equal(states('apple', 'allee'), 'C P A A C');
  });

  it('does not over-credit duplicate guess letters', () => {
    assert.equal(states('cigar', 'civic'), 'C C A A A');
  });

  it('handles duplicate answer and duplicate guess letters', () => {
    assert.equal(states('belle', 'level'), 'P C A P P');
  });

  it('handles present duplicate letters after exact matches are consumed', () => {
    assert.equal(states('allee', 'eagle'), 'P P A P C');
  });

  it('handles repeated answer letters in mixed positions', () => {
    assert.equal(states('mamma', 'maxim'), 'C C A A P');
  });

  it('handles tied duplicate allocation deterministically left to right', () => {
    assert.equal(states('array', 'rarer'), 'P P C A A');
    assert.equal(states('banal', 'llama'), 'P A P A P');
  });
});

describe('calculateRoundScore', () => {
  it('matches the Ticket 04 examples for a 120 second round', () => {
    assert.deepEqual(calculateRoundScore({ solved: true, validGuessCount: 3, elapsedMs: 45_000, roundTimeMs: 120_000 }), {
      base: 100,
      guessBonus: 40,
      speedBonus: 31,
      penalty: 0,
      adjustment: 0,
      total: 171,
      scoringPreset: 'standard_v1',
    });

    assert.equal(calculateRoundScore({ solved: true, validGuessCount: 5, elapsedMs: 90_000, roundTimeMs: 120_000 }).total, 123);
    assert.equal(calculateRoundScore({ solved: false, validGuessCount: 6, elapsedMs: 120_000, roundTimeMs: 120_000 }).total, 0);
    assert.equal(calculateRoundScore({ solved: true, validGuessCount: 1, elapsedMs: 10_000, roundTimeMs: 120_000 }).total, 206);
  });

  it('clamps speed bonus when elapsed time exceeds round time', () => {
    assert.equal(calculateRoundScore({ solved: true, validGuessCount: 6, elapsedMs: 130_000, roundTimeMs: 120_000 }).speedBonus, 0);
  });
});

describe('calculateFinalStandings', () => {
  const base = {
    roundsSolved: 2,
    totalValidGuesses: 8,
    totalSolveMs: 100_000,
    bestRoundScore: 170,
    finalRound: { state: 'solved' as const, validGuessCount: 4, solveMs: 50_000, roundScore: 150 },
  };

  it('sorts by total score first', () => {
    const standings = calculateFinalStandings([
      { userId: 'B', totalScore: 300, ...base },
      { userId: 'A', totalScore: 350, ...base },
    ]);
    assert.deepEqual(standings.map((entry) => entry.userId), ['A', 'B']);
  });

  it('uses rounds solved before total guesses when scores tie', () => {
    const comparison = compareForStandings(
      { userId: 'A', totalScore: 300, roundsSolved: 3, totalValidGuesses: 10, totalSolveMs: 150_000, bestRoundScore: 160 },
      { userId: 'B', totalScore: 300, roundsSolved: 2, totalValidGuesses: 7, totalSolveMs: 90_000, bestRoundScore: 170 },
    );
    assert.equal(comparison < 0, true);
  });

  it('assigns the same placement group for complete ties', () => {
    const standings = calculateFinalStandings([
      { userId: 'B', totalScore: 300, ...base },
      { userId: 'A', totalScore: 300, ...base },
      { userId: 'C', totalScore: 250, ...base },
    ]);
    assert.deepEqual(standings.map((entry) => [entry.userId, entry.placement, entry.placementGroup, entry.tied]), [
      ['A', 1, 1, true],
      ['B', 1, 1, true],
      ['C', 3, 2, false],
    ]);
  });
});

describe('calculatePlacementMmrDeltas', () => {
  it('matches equal-rated 4-player placement example using established defaults', () => {
    assert.deepEqual(
      calculatePlacementMmrDeltas(
        [
          { userId: 'A', rating: 1500 },
          { userId: 'B', rating: 1500 },
          { userId: 'C', rating: 1500 },
          { userId: 'D', rating: 1500 },
        ],
        [['A'], ['B'], ['C'], ['D']],
      ).map(({ userId, delta, ratingAfter }) => ({ userId, delta, ratingAfter })),
      [
        { userId: 'A', delta: 36, ratingAfter: 1536 },
        { userId: 'B', delta: 12, ratingAfter: 1512 },
        { userId: 'C', delta: -12, ratingAfter: 1488 },
        { userId: 'D', delta: -36, ratingAfter: 1464 },
      ],
    );
  });

  it('supports ties as 0.5 actual score within the same placement group', () => {
    assert.deepEqual(
      calculatePlacementMmrDeltas(
        [
          { userId: 'A', rating: 1500 },
          { userId: 'B', rating: 1500 },
          { userId: 'C', rating: 1500 },
          { userId: 'D', rating: 1500 },
        ],
        [['A'], ['B', 'C'], ['D']],
      ).map(({ userId, delta }) => ({ userId, delta })),
      [
        { userId: 'A', delta: 36 },
        { userId: 'B', delta: 0 },
        { userId: 'C', delta: 0 },
        { userId: 'D', delta: -36 },
      ],
    );
  });

  it('applies provisional K and cap separately from established players', () => {
    const [player] = calculatePlacementMmrDeltas(
      [
        { userId: 'A', rating: 1500, provisional: true },
        { userId: 'B', rating: 1500 },
        { userId: 'C', rating: 1500 },
        { userId: 'D', rating: 1500 },
      ],
      [['A'], ['B'], ['C'], ['D']],
    );
    assert.equal(player?.delta, 54);
    assert.equal(player?.ratingAfter, 1554);
  });
});
