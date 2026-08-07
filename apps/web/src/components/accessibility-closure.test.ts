import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { scoreGuess } from '@wordle-royale/game-engine';
import {
  acceptedGuessAnnouncement,
  FRESH_ROUND_ANNOUNCEMENT,
  MEMORY_ONLY_WARNING,
  practiceKeyLabel,
  restoredRoundAnnouncement,
} from './practice-accessibility.ts';
import { wordTileLabel } from './ranked-accessibility.ts';

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

describe('Practice accessibility behavior', () => {
  it('formats one ordered accepted-guess announcement with remaining guesses', () => {
    const feedback = scoreGuess('crane', 'slate');
    assert.equal(
      acceptedGuessAnnouncement({ guess: 'slate', feedback }, 5),
      'Submitted SLATE. S absent, L absent, A correct, T absent, E correct. 5 guesses remaining.',
    );
    assert.match(practiceSource, /game\.rows\.length > session\.game\.rows\.length[\s\S]*acceptedGuessAnnouncement/);
    assert.doesNotMatch(practiceSource, /action\.type === 'letter'[\s\S]{0,100}setAnnouncement/);
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
    assert.match(practiceSource, /const playAgain[\s\S]*focusHeadingAfterStartOver\.current = true;[\s\S]*setAnnouncement\(FRESH_ROUND_ANNOUNCEMENT\)/);
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
  assert.match(webPackage.scripts.test, /src\/components\/accessibility-closure\.test\.ts/);
});
