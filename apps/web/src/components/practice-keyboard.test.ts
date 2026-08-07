import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { practiceActionForKey, shouldHandlePracticeKeydown, type PracticeKeydownFacts } from './practice-keyboard.ts';

const normal: PracticeKeydownFacts = {
  key: 'a',
  gamePlaying: true,
  targetIsElement: true,
  targetIsInteractive: false,
  defaultPrevented: false,
  isComposing: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

function accepts(overrides: Partial<PracticeKeydownFacts> = {}): boolean {
  return shouldHandlePracticeKeydown({ ...normal, ...overrides });
}

describe('practice physical keyboard policy', () => {
  it('accepts ordinary letters, Enter, and Backspace from non-interactive elements', () => {
    assert.equal(accepts({ key: 'g' }), true);
    assert.equal(accepts({ key: 'Enter' }), true);
    assert.equal(accepts({ key: 'Backspace' }), true);
    assert.deepEqual(practiceActionForKey('G'), { type: 'letter', letter: 'G' });
    assert.deepEqual(practiceActionForKey('Enter'), { type: 'submit' });
    assert.deepEqual(practiceActionForKey('Backspace'), { type: 'backspace' });
  });

  it('ignores interactive targets and descendants, and targets outside Element', () => {
    assert.equal(accepts({ targetIsInteractive: true }), false);
    assert.equal(accepts({ targetIsElement: false }), false);
  });

  it('ignores modified, composing, and already-consumed events', () => {
    for (const flag of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'isComposing', 'defaultPrevented'] as const) {
      assert.equal(accepts({ [flag]: true }), false, flag);
    }
  });

  it('ignores terminal games and unrelated keys', () => {
    assert.equal(accepts({ gamePlaying: false }), false);
    assert.equal(accepts({ key: 'Escape' }), false);
    assert.equal(accepts({ key: 'Tab' }), false);
    assert.equal(accepts({ key: 'aa' }), false);
  });
});
