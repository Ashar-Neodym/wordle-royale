import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const hub = readFileSync(new URL('./ChallengeHub.tsx', import.meta.url), 'utf8');
const game = readFileSync(new URL('./ChallengeGame.tsx', import.meta.url), 'utf8');
const hubPage = readFileSync(new URL('../app/challenge/page.tsx', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/challenge/[challengeId]/page.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./challenge.module.css', import.meta.url), 'utf8');
const practiceStyles = readFileSync(new URL('./practice.module.css', import.meta.url), 'utf8');
const packageJson = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');

const runtimeSources = [hub, game, hubPage, route];

describe('Same-Puzzle Challenge browser surfaces', () => {
  it('keeps both routes browser-local and outside runtime transport/session boundaries', () => {
    for (const source of runtimeSources) {
      assert.doesNotMatch(source, /\bfetch\s*\(|WebSocket|sendBeacon|document\.cookie|cookies\s*\(|headers\s*\(|api-client/);
    }
    assert.match(hub, /asynchronous · browser-local · unrated/i);
    assert.match(hub, /Not authoritative or cheat-resistant/);
    assert.match(game, /not authoritative or cheat-resistant/);
    assert.match(game, /No account or API requests are made/);
  });

  it('creates through injected secure randomness without answer resolution or weak fallback', () => {
    assert.match(hub, /globalThis\.crypto\?\.getRandomValues\?\.bind/);
    assert.match(hub, /createChallengeId\(getRandomValues\)/);
    assert.doesNotMatch(hub, /Math\.random|PRACTICE_ANSWERS|CURATED_ANSWERS|\.answer\b|parseChallengeId/);
    assert.match(hub, /No weaker random fallback was used/);
    assert.match(hub, /window\.location\.origin/);
  });

  it('validates open IDs without a random fallback and exposes accessible generated/manual copy', () => {
    assert.match(hub, /const value = openId\.trim\(\)/);
    assert.match(hub, /canonicalizeChallengeId\(value\)/);
    assert.match(hub, /window\.location\.assign\(`\/challenge\/\$\{canonicalId\}`\)/);
    assert.match(hub, /role="alert"/);
    assert.match(hub, /ref=\{generatedHeadingRef\} tabIndex=\{-1\} aria-live="polite"/);
    assert.match(hub, /role="status" aria-live="polite"/);
    assert.match(hub, /ref=\{manualCopyRef\}[\s\S]*aria-describedby="challenge-link-copy-instructions"[\s\S]*readOnly/);
  });

  it('keeps the server route contract opaque and invalid links deterministic', () => {
    assert.match(route, /parseChallengeId\(challengeId\)/);
    assert.match(route, /<ChallengeGame challengeId=\{parsed\.challengeId\} \/>/);
    assert.doesNotMatch(route, /parsed\.(?:answer|answerIndex|nonce)|answer=/);
    assert.match(game, /parseChallengeId\(challengeId\)/);
    assert.match(game, /Challenge link unavailable/);
    const unavailable = game.slice(game.indexOf('export function ChallengeUnavailable'));
    assert.deepEqual([...unavailable.matchAll(/href="([^"]+)"/g)].map((match) => match[1]), ['/practice', '/challenge', '/learn/rules']);
    assert.doesNotMatch(unavailable, /board|storage|random/i);
  });

  it('reuses the game reducer, keyboard/accessibility helpers and terminal answer/share gates', () => {
    assert.match(game, /practiceReducer\(session\.game, action\)/);
    assert.match(game, /practiceAnnouncementForTransition\(session\.game, game, action\)/);
    assert.match(game, /practiceActionForKey|shouldHandlePracticeKeydown|practiceKeyLabel/);
    assert.match(game, /aggregateKeyStates/);
    assert.match(game, /role="grid" aria-label="Wordle challenge board"/);
    assert.match(game, /role="row"/);
    assert.match(game, /role="gridcell"/);
    assert.match(game, /terminal && game \? <div[\s\S]*game\.answer\.toUpperCase/);
    assert.match(game, /terminal && session[\s\S]*formatChallengeShare/);
    assert.match(game, /stateMark[\s\S]*correct' \? '✓'[\s\S]*present' \? '◇' : '—'/);
    assert.match(practiceStyles, /@media \(forced-colors: active\)/);
  });

  it('isolates per-ID restore, corruption, completion, and memory-only behavior from Practice continuity', () => {
    assert.match(game, /challengeRoundStorageKey\(canonicalId\)/);
    assert.match(game, /loadChallengeSession\(storage, canonicalId\)/);
    assert.match(game, /Saved challenge progress was corrupted and has been reset/);
    assert.match(game, /restoreNotice \? <div className=\{styles\.storageWarning\} role="status"/);
    assert.match(game, /saveChallengeSession\(storageRef\.current, next\)/);
    assert.match(game, /remains playable in memory/);
    assert.doesNotMatch(game, /PRACTICE_(?:ROUND|STATS)_STORAGE_KEY|Practice stats|Start over|Play again|recordPracticeResult/);
    assert.match(game, /Create another/);
  });

  it('provides bounded compact controls, wrapping URLs, 44px targets, and manual result copy', () => {
    assert.match(styles, /overflow-wrap: anywhere/);
    assert.match(styles, /min-height: 44px/);
    assert.match(styles, /@media \(max-width: 280px\)[\s\S]*flex-direction: column/);
    assert.match(practiceStyles, /--tile-size: min\(58px, calc\(\(100vw - 50px\) \/ 5\)\)/);
    assert.match(practiceStyles, /@media \(max-width: 350px\)[\s\S]*\.key \{ min-height: 44px/);
    assert.match(game, /ref=\{manualCopyRef\}[\s\S]*aria-describedby="challenge-result-copy-instructions"[\s\S]*readOnly/);
  });

  it('is permanently included in the focused and full web suites', () => {
    assert.match(packageJson, /src\/components\/challenge-surface\.test\.ts/);
    assert.match(packageJson, /"test:challenge"[^\n]*challenge-surface\.test\.ts/);
  });
});
