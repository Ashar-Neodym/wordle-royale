import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LetterFeedbackState } from '@wordle-royale/game-engine';
import {
  aggregateKeyStates,
  createPracticeState,
  PRACTICE_ANSWERS,
  PRACTICE_VALID_GUESSES,
  practiceReducer,
  type PracticeState,
} from './practice-game.ts';

function typeWord(state: PracticeState, word: string): PracticeState {
  return [...word].reduce((current, letter) => practiceReducer(current, { type: 'letter', letter }), state);
}

function submit(state: PracticeState, word: string): PracticeState {
  return practiceReducer(typeWord(state, word), { type: 'submit' });
}

describe('practice game state', () => {
  it('uses a varied answer list and accepts every answer as a guess', () => {
    assert.ok(PRACTICE_ANSWERS.length >= 30);
    assert.ok(PRACTICE_ANSWERS.every((answer) => PRACTICE_VALID_GUESSES.has(answer)));
  });

  it('handles letter input, its limit, and backspace', () => {
    let state = typeWord(createPracticeState('crane'), 'cranes');
    assert.equal(state.currentGuess, 'crane');
    state = practiceReducer(state, { type: 'backspace' });
    assert.equal(state.currentGuess, 'cran');
    state = practiceReducer(state, { type: 'letter', letter: '1' });
    assert.equal(state.currentGuess, 'cran');
  });

  it('rejects too-short and unknown words without consuming a guess', () => {
    let state = practiceReducer(typeWord(createPracticeState('crane'), 'cat'), { type: 'submit' });
    assert.equal(state.message, 'Not enough letters.');
    assert.equal(state.rows.length, 0);

    state = practiceReducer(typeWord(createPracticeState('crane'), 'zzzzz'), { type: 'submit' });
    assert.equal(state.message, 'That word is not in the practice list.');
    assert.equal(state.rows.length, 0);
  });

  it('wins on a correct guess and reports the attempt count', () => {
    const state = submit(createPracticeState('crane'), 'crane');
    assert.equal(state.status, 'won');
    assert.equal(state.rows.length, 1);
    assert.equal(state.message, 'Solved in 1 guess!');
    assert.ok(state.rows[0]?.feedback.every((cell) => cell.state === 'correct'));
  });

  it('loses after six valid guesses', () => {
    let state = createPracticeState('apple');
    for (const guess of ['crane', 'sound', 'light', 'civic', 'bloom', 'chair']) state = submit(state, guess);
    assert.equal(state.status, 'lost');
    assert.equal(state.rows.length, 6);
    assert.match(state.message, /revealed below/);
  });

  it('resets all progress with a new answer', () => {
    const won = submit(createPracticeState('crane'), 'crane');
    const reset = practiceReducer(won, { type: 'reset', answer: 'slate' });
    assert.deepEqual(reset, createPracticeState('slate'));
  });

  it('locks all input and submissions after a terminal result', () => {
    const won = submit(createPracticeState('crane'), 'crane');
    assert.equal(practiceReducer(won, { type: 'letter', letter: 'a' }), won);
    assert.equal(practiceReducer(won, { type: 'backspace' }), won);
    assert.equal(practiceReducer(won, { type: 'submit' }), won);
  });

  it('keeps repeat-letter scoring from the shared engine', () => {
    const state = submit(createPracticeState('apple'), 'allee');
    assert.deepEqual(state.rows[0]?.feedback.map((cell) => cell.state), [
      'correct', 'present', 'absent', 'absent', 'correct',
    ]);
  });

  it('aggregates keyboard feedback with correct over present over absent', () => {
    const feedback = (state: LetterFeedbackState) => ({ letter: 'a', state });
    const states = aggregateKeyStates([
      { guess: 'a', feedback: [feedback('correct')] },
      { guess: 'a', feedback: [feedback('absent')] },
      { guess: 'a', feedback: [feedback('present')] },
    ]);
    assert.equal(states.get('a'), 'correct');

    const presentStates = aggregateKeyStates([
      { guess: 'a', feedback: [feedback('absent')] },
      { guess: 'a', feedback: [feedback('present')] },
    ]);
    assert.equal(presentStates.get('a'), 'present');
  });
});
