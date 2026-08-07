import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const gameSource = readFileSync(new URL('./PracticeGame.tsx', import.meta.url), 'utf8');
const persistenceSource = readFileSync(new URL('../lib/practice-persistence.ts', import.meta.url), 'utf8');
const practicePageSource = readFileSync(new URL('../app/practice/page.tsx', import.meta.url), 'utf8');
const pageFrameSource = readFileSync(new URL('./PageFrame.tsx', import.meta.url), 'utf8');
const homeSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const playSource = readFileSync(new URL('../app/play/page.tsx', import.meta.url), 'utf8');
const navSource = readFileSync(new URL('./SiteNav.tsx', import.meta.url), 'utf8');
const navModelSource = readFileSync(new URL('./site-nav-model.ts', import.meta.url), 'utf8');
const practiceStyles = readFileSync(new URL('./practice.module.css', import.meta.url), 'utf8');
const shellStyles = readFileSync(new URL('./web-shell.module.css', import.meta.url), 'utf8');

describe('practice surface boundaries', () => {
  it('keeps the game browser-local and uses the shared engine', () => {
    assert.match(gameSource, /from '@wordle-royale\/game-engine'/);
    assert.doesNotMatch(`${gameSource}\n${persistenceSource}`, /\bfetch\s*\(|sessionStorage|document\.cookie/);
    assert.doesNotMatch(gameSource, /window\.localStorage/);
    assert.match(gameSource, /getBrowserStorage\(window\)/);
    assert.match(persistenceSource, /wordle-royale:practice:round:v1/);
    assert.match(persistenceSource, /wordle-royale:practice:stats:v1/);
    assert.match(gameSource, /globalThis\.crypto\.getRandomValues/);
  });

  it('gates the visible answer behind terminal state', () => {
    assert.match(gameSource, /terminal && game[\s\S]*The word was[\s\S]*game\.answer\.toUpperCase\(\)/);
    assert.match(gameSource, /Practice · guest · not rated/);
    assert.match(gameSource, /href="\/play">Play options<\/a>/);
    assert.doesNotMatch(gameSource, />Ranked play<\/a>/);
    assert.match(gameSource, /aria-label="Wordle practice board"/);
    assert.match(gameSource, /aria-label="On-screen keyboard"/);
    assert.match(gameSource, /Copy result/);
    assert.match(gameSource, /Win streak/);
    assert.match(gameSource, /Reset all practice stats/);
    assert.match(gameSource, /Progress and stats stay in this browser across reloads\./);
    assert.match(gameSource, /Progress and stats are memory-only for this visit\./);
    assert.match(gameSource, /random word each round—not a daily puzzle/);
    assert.match(gameSource, /game\?\.status === 'playing'[\s\S]*Start over[\s\S]*Confirm start over[\s\S]*Cancel/);
    assert.match(gameSource, /FRESH_ROUND_ANNOUNCEMENT/);
    assert.doesNotMatch(gameSource.match(/game\?\.status === 'playing'[\s\S]*?<div className=\{styles\.board\}/)?.[0] ?? '', /game\.answer\.toUpperCase/);
    assert.doesNotMatch(practicePageSource, /PRACTICE_ANSWERS|answer/i);
  });

  it('makes practice reachable from home, ranked play, and navigation', () => {
    assert.match(homeSource, /href="\/practice">Play practice/);
    assert.match(playSource, /Guest practice[\s\S]*href="\/practice">Play practice/);
    assert.match(navModelSource, /href: '\/practice', label: 'Practice'/);
    assert.match(navSource, /siteNavModel\(presentation\)/);
  });

  it('keeps account deployment notices off the account-free practice surface', () => {
    assert.match(practicePageSource, /showEnvironmentNotice=\{false\}/);
    assert.match(pageFrameSource, /showEnvironmentNotice = true/);
  });

  it('puts navigation before exactly one focusable main and exposes a first skip link', () => {
    assert.match(pageFrameSource, /<div className=\{styles\.shell\}>\s*<a className=\{styles\.skipLink\} href="#main-content">Skip to main content<\/a>\s*<SiteNav/);
    assert.match(pageFrameSource, /<main id="main-content" className=\{styles\.mainContent\} tabIndex=\{-1\}>/);
    assert.equal((pageFrameSource.match(/<main\b/g) ?? []).length, 1);
    assert.match(shellStyles, /\.mainContent \{ min-width: 0; \}/);
    assert.match(shellStyles, /\.skipLink[^}]*transform: translateY\(-150%\)/);
    assert.match(shellStyles, /\.skipLink:focus[^}]*transform: translateY\(0\)/);
  });

  it('preserves keyboard semantics while adding focus and non-color state cues', () => {
    assert.match(gameSource, /closest\('a, button, input, textarea, select, summary, \[contenteditable\]'\)/);
    assert.match(gameSource, /defaultPrevented: event\.defaultPrevented/);
    assert.match(gameSource, /isComposing: event\.isComposing/);
    assert.match(gameSource, /ref=\{confirmStartOverRef\}[\s\S]*Confirm start over/);
    assert.match(gameSource, /restoreStartOverFocus\.current = true/);
    assert.match(gameSource, /restoreStatsFocus\.current = true/);
    assert.match(gameSource, /terminal \? <span className=\{styles\.statsLabel\}>Stats shown below/);
    assert.match(gameSource, /className=\{styles\.stateMark\} aria-hidden="true"/);
    assert.match(gameSource, /className=\{styles\.keyStateMark\} aria-hidden="true"/);
    assert.match(practiceStyles, /@media \(forced-colors: active\)/);
  });

  it('keeps compact controls tall and the ten-key row viable at 280px', () => {
    assert.match(practiceStyles, /\.startOver button \{ min-height: 44px/);
    assert.match(practiceStyles, /\.closeStats \{ width: 44px; min-height: 44px/);
    assert.match(practiceStyles, /\.key \{[\s\S]*?min-height: 48px/);
    assert.match(practiceStyles, /@media \(max-width: 520px\)[\s\S]*?\.keyRow \{ gap: 2px; \}/);
    assert.match(shellStyles, /\.primaryButton, \.secondaryButton[^}]*min-height: 44px/);
    assert.match(shellStyles, /\.mobileMenuPanel a[^}]*min-height: 44px/);
    // At this viewport the shell's <=360px rule leaves 7px on each side.
    const availableWidth = 280 - 14;
    const computedFirstRowKeyWidth = (availableWidth - (9 * 2)) / 10;
    assert.ok(computedFirstRowKeyWidth >= 24, `${computedFirstRowKeyWidth}px key width`);
  });
});
