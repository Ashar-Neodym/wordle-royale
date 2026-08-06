import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const gameSource = readFileSync(new URL('./PracticeGame.tsx', import.meta.url), 'utf8');
const practicePageSource = readFileSync(new URL('../app/practice/page.tsx', import.meta.url), 'utf8');
const pageFrameSource = readFileSync(new URL('./PageFrame.tsx', import.meta.url), 'utf8');
const homeSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const playSource = readFileSync(new URL('../app/play/page.tsx', import.meta.url), 'utf8');
const navSource = readFileSync(new URL('./SiteNav.tsx', import.meta.url), 'utf8');

describe('practice surface boundaries', () => {
  it('keeps the game local and uses the shared engine', () => {
    assert.match(gameSource, /from '@wordle-royale\/game-engine'/);
    assert.doesNotMatch(gameSource, /\bfetch\s*\(|localStorage|sessionStorage|document\.cookie/);
    assert.match(gameSource, /globalThis\.crypto\.getRandomValues/);
  });

  it('gates the visible answer behind terminal state', () => {
    assert.match(gameSource, /terminal && game[\s\S]*The word was[\s\S]*game\.answer\.toUpperCase\(\)/);
    assert.match(gameSource, /Practice · guest · not rated/);
    assert.match(gameSource, /aria-label="Wordle practice board"/);
    assert.match(gameSource, /aria-label="On-screen keyboard"/);
  });

  it('makes practice reachable from home, ranked play, and navigation', () => {
    assert.match(homeSource, /href="\/practice">Play practice/);
    assert.match(playSource, /Guest practice[\s\S]*href="\/practice">Play practice/);
    assert.match(navSource, /href: '\/practice', label: 'Practice'/);
    assert.match(navSource, /<a href="\/practice">Practice<\/a>/);
  });

  it('keeps account deployment notices off the account-free practice surface', () => {
    assert.match(practicePageSource, /showEnvironmentNotice=\{false\}/);
    assert.match(pageFrameSource, /showEnvironmentNotice = true/);
  });
});
