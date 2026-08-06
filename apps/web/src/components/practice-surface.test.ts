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
    assert.match(gameSource, /Progress and stats stay in this browser\. Practice gameplay sends no account or API requests\./);
    assert.match(gameSource, /random word each round—not a daily puzzle/);
    assert.match(gameSource, /game\?\.status === 'playing'[\s\S]*Start over[\s\S]*Confirm start over[\s\S]*Cancel/);
    assert.match(gameSource, /Started a fresh practice round\./);
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
});
