import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  acceptedGuessAnnouncement,
  advancePracticeAnnouncement,
  EMPTY_PRACTICE_ANNOUNCEMENT,
  FRESH_ROUND_ANNOUNCEMENT,
  MEMORY_ONLY_WARNING,
  practiceAnnouncementForTransition,
  practiceKeyLabel,
  restoredRoundAnnouncement,
} from './practice-accessibility.ts';
import { wordTileLabel } from './ranked-accessibility.ts';
import { createPracticeState, practiceReducer, type PracticeState } from '../lib/practice-game.ts';

const practiceSource = readFileSync(new URL('./PracticeGame.tsx', import.meta.url), 'utf8');
const practiceStyles = readFileSync(new URL('./practice.module.css', import.meta.url), 'utf8');
const wordTileSource = readFileSync(new URL('./WordTile.tsx', import.meta.url), 'utf8');
const standardSource = readFileSync(new URL('./GameplayScreen.tsx', import.meta.url), 'utf8');
const speedSource = readFileSync(new URL('./SpeedGameplayPanel.tsx', import.meta.url), 'utf8');
const resultSource = readFileSync(new URL('../app/matches/[matchId]/page.tsx', import.meta.url), 'utf8');
const webPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  scripts: { test: string };
};

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * channels[0]!) + (0.7152 * channels[1]!) + (0.0722 * channels[2]!);
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

function cssColor(pattern: RegExp): string {
  const value = practiceStyles.match(pattern)?.[1];
  assert.ok(value, `Missing CSS color for ${pattern}`);
  return value;
}

function enterGuess(state: PracticeState, guess: string): { previous: PracticeState; next: PracticeState } {
  let previous = state;
  for (const letter of guess) previous = practiceReducer(previous, { type: 'letter', letter });
  return { previous, next: practiceReducer(previous, { type: 'submit' }) };
}

describe('Practice accessibility behavior', () => {
  it('composes one ordered nonterminal accepted-guess announcement from the next game state', () => {
    const { previous, next } = enterGuess(createPracticeState('crane'), 'slate');
    assert.equal(
      acceptedGuessAnnouncement(next.rows[0]!, next),
      'Submitted SLATE. S absent, L absent, A correct, T absent, E correct. 5 guesses remaining.',
    );
    assert.equal(
      practiceAnnouncementForTransition(previous, next, { type: 'submit' }),
      'Submitted SLATE. S absent, L absent, A correct, T absent, E correct. 5 guesses remaining.',
    );
    assert.match(practiceSource, /practiceAnnouncementForTransition\(session\.game, game, action\)/);
    assert.doesNotMatch(practiceSource, /action\.type === 'letter'[\s\S]{0,100}setAnnouncement/);
  });

  it('announces fresh empty and repeated unchanged short submit rejections', () => {
    const fresh = createPracticeState('crane');
    const emptyRejection = practiceReducer(fresh, { type: 'submit' });
    assert.equal(emptyRejection.message, fresh.message);
    assert.equal(
      practiceAnnouncementForTransition(fresh, emptyRejection, { type: 'submit' }),
      'Type a five-letter word.',
    );

    let short = practiceReducer(fresh, { type: 'letter', letter: 'a' });
    short = practiceReducer(short, { type: 'letter', letter: 'b' });
    const firstRejection = practiceReducer(short, { type: 'submit' });
    const repeatedRejection = practiceReducer(firstRejection, { type: 'submit' });
    assert.equal(repeatedRejection.message, firstRejection.message);
    assert.equal(
      practiceAnnouncementForTransition(firstRejection, repeatedRejection, { type: 'submit' }),
      'Not enough letters.',
    );
  });

  it('replaces the live-region child for consecutive identical rejection announcements', () => {
    const first = advancePracticeAnnouncement(EMPTY_PRACTICE_ANNOUNCEMENT, 'Not enough letters.');
    const second = advancePracticeAnnouncement(first, 'Not enough letters.');

    assert.equal(first.message, second.message);
    assert.notEqual(first.revision, second.revision);
    assert.deepEqual([first.revision, second.revision], [1, 2]);
    assert.match(
      practiceSource,
      /role="status" aria-live="polite" aria-atomic="true">\s*<span key=\{announcement\.revision\}>\{announcement\.message\}<\/span>/,
    );
  });

  it('announces a first-guess win atomically without a remaining count or extra answer disclosure', () => {
    const { previous, next } = enterGuess(createPracticeState('crane'), 'crane');
    const announcement = practiceAnnouncementForTransition(previous, next, { type: 'submit' });
    assert.equal(
      announcement,
      'Submitted CRANE. C correct, R correct, A correct, N correct, E correct. Solved! You win in 1 attempt.',
    );
    assert.doesNotMatch(announcement!, /remaining|answer was/i);
  });

  it('announces a later win with the post-submit attempt count', () => {
    const first = enterGuess(createPracticeState('crane'), 'slate').next;
    const { previous, next } = enterGuess(first, 'crane');
    const announcement = practiceAnnouncementForTransition(previous, next, { type: 'submit' });
    assert.equal(
      announcement,
      'Submitted CRANE. C correct, R correct, A correct, N correct, E correct. Solved! You win in 2 attempts.',
    );
    assert.doesNotMatch(announcement!, /remaining|answer was/i);
  });

  it('announces the sixth-guess loss and discloses the answer only in that terminal transition', () => {
    let state = createPracticeState('crane');
    for (let attempt = 1; attempt < 6; attempt += 1) {
      const transition = enterGuess(state, 'slate');
      state = transition.next;
      assert.equal(state.status, 'playing');
      assert.doesNotMatch(practiceAnnouncementForTransition(transition.previous, state, { type: 'submit' })!, /answer/i);
    }
    const { previous, next } = enterGuess(state, 'slate');
    const announcement = practiceAnnouncementForTransition(previous, next, { type: 'submit' });
    assert.equal(next.status, 'lost');
    assert.equal(
      announcement,
      'Submitted SLATE. S absent, L absent, A correct, T absent, E correct. Round ended. You lost after 6 attempts. The answer was CRANE.',
    );
    assert.doesNotMatch(announcement!, /remaining/);
  });

  it('labels keys with state and preserves precedence-driven state composition', () => {
    for (const state of ['unused', 'absent', 'present', 'correct'] as const) {
      assert.equal(practiceKeyLabel('r', state), `Letter R, ${state}`);
    }
    assert.equal(practiceKeyLabel('Enter', 'correct'), 'Submit guess');
    assert.equal(practiceKeyLabel('Backspace', 'absent'), 'Delete letter');
    assert.match(practiceSource, /practiceKeyLabel\(key, state \?\? 'unused'\)/);
  });

  it('announces restored state and fresh rounds without answer spoilers', () => {
    assert.equal(restoredRoundAnnouncement(2, 3), 'Practice round restored: 2 submitted guesses; 3 letters in the current guess.');
    assert.equal(restoredRoundAnnouncement(1, 1), 'Practice round restored: 1 submitted guess; 1 letter in the current guess.');
    assert.equal(FRESH_ROUND_ANNOUNCEMENT, 'Fresh practice round started. No guesses submitted.');
    for (const text of [restoredRoundAnnouncement(2, 3), FRESH_ROUND_ANNOUNCEMENT, MEMORY_ONLY_WARNING]) {
      assert.doesNotMatch(text, /answer|the word was/i);
    }
    assert.match(practiceSource, /focusHeadingAfterStartOver\.current = true;[\s\S]*setSession\(fresh\)/);
  });

  it('moves focus and announces Play again, Stats, and reset-confirm transitions', () => {
    assert.match(practiceSource, /const playAgain[\s\S]*focusHeadingAfterStartOver\.current = true;[\s\S]*announce\(FRESH_ROUND_ANNOUNCEMENT\)/);
    assert.match(practiceSource, /if \(focusHeadingAfterStartOver\.current\)[\s\S]{0,180}headingRef\.current\?\.focus\(\)/);
    assert.match(practiceSource, /if \(statsOpen\) statsHeadingRef\.current\?\.focus\(\)/);
    assert.match(practiceSource, /restoreStatsFocus\.current = true;[\s\S]{0,150}setStatsOpen\(false\)/);
    assert.match(practiceSource, /if \(resetConfirm\) confirmResetRef\.current\?\.focus\(\)/);
    assert.match(practiceSource, /<span role="status">Reset all practice stats\?<\/span>/);
    assert.match(practiceSource, /setCopyStatus\('Practice stats reset\.'\)/);
    assert.match(practiceSource, /restoreResetFocus\.current = true;[\s\S]{0,150}setResetConfirm\(false\)/);
  });

  it('truthfully exposes memory-only mode after unavailable or failed storage', () => {
    assert.match(practiceSource, /if \(!storage\) setMemoryOnly\(true\)/);
    assert.match(practiceSource, /noteStorageFailure\(savePracticeSession/);
    assert.match(practiceSource, /noteStorageFailure\(savePracticeStats/);
    assert.match(practiceSource, /memoryOnly \? 'Progress and stats are memory-only for this visit\.'/);
    assert.match(MEMORY_ONLY_WARNING, /will not survive a reload/);
  });

  it('keeps all authored used-key label and marker colors at 4.5:1 or better', () => {
    const states = {
      correct: [cssColor(/--practice-correct:\s*(#[0-9a-f]{6})/i), '#ffffff'],
      present: [cssColor(/--practice-present:\s*(#[0-9a-f]{6})/i), cssColor(/\.key\[data-state='present'\][^{]*\{[^}]*color:\s*(#[0-9a-f]{6})/i)],
      absent: [cssColor(/--practice-absent:\s*(#[0-9a-f]{6})/i), cssColor(/\.key\[data-state='absent'\][^{]*\{[^}]*color:\s*(#[0-9a-f]{6})/i)],
    } as const;
    for (const [state, [background, foreground]] of Object.entries(states)) {
      assert.ok(contrast(foreground, background) >= 4.5, `${state}: ${contrast(foreground, background).toFixed(2)}:1`);
    }
    assert.doesNotMatch(practiceStyles, /\.key:disabled[^}]*opacity/);
    assert.match(practiceStyles, /@media \(forced-colors: active\)/);
  });
});

describe('ranked grid and rematch semantics', () => {
  it('provides coordinate-aware grid cells under rows for Standard and Speed', () => {
    assert.equal(wordTileLabel('a', 'correct', 2, 4), 'Row 2, column 4, A, correct');
    assert.match(wordTileSource, /role="gridcell"[\s\S]*aria-rowindex=\{row\}[\s\S]*aria-colindex=\{column\}/);
    for (const source of [standardSource, speedSource]) {
      assert.match(source, /role="grid"[^>]*aria-rowcount=/);
      assert.match(source, /role="row"[^>]*aria-rowindex=/);
      assert.match(source, /<WordTile[^>]*row=\{[^}]+\}[^>]*column=\{/);
    }
  });

  it('renders available rematch as a link and unavailable rematch as text', () => {
    assert.match(resultSource, /resultActions\.rematch\.available[\s\S]*\? <a[^>]*href=\{resultActions\.links\.nextRankedHref\}>Play again<\/a>[\s\S]*: <span[^>]*>Play again unavailable<\/span>/);
    assert.doesNotMatch(resultSource, /aria-disabled=\{!resultActions\.rematch\.available\}/);
  });
});

it('permanently includes the accessibility closure tests in the web suite', () => {
  assert.equal(webPackage.scripts.test, 'node scripts/run-tests.mjs');
});
