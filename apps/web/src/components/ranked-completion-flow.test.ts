import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const actionsSource = readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
const gameplaySource = readFileSync(new URL('./GameplayScreen.tsx', import.meta.url), 'utf8');
const speedSource = readFileSync(new URL('./SpeedGameplayPanel.tsx', import.meta.url), 'utf8');
const webPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  scripts: { test: string };
};

describe('ranked completion flow', () => {
  it('sends successful Standard completion to the encoded canonical result route and keeps failures in gameplay recovery', () => {
    assert.match(actionsSource, /const resultPath = `\/matches\/\$\{encodeURIComponent\(matchId\)\}`;/);
    assert.match(actionsSource, /revalidatePath\(resultPath\);\s*redirect\(resultPath\);/);
    assert.match(actionsSource, /resultRedirect\(\{ action: 'complete_match', status: 'error', matchId,[\s\S]*\}, 'gameplay'\);/);
  });

  it('renders compact inline Standard actions only from the connected server result contract', () => {
    assert.match(gameplaySource, /<article id="report" className=\{styles\.panelWide\}>/);
    assert.match(gameplaySource, /result\.rankedMode === 'standard_1v1'[\s\S]*href=\{result\.resultActions\.links\.matchHref\}>View full result<\/a>[\s\S]*href=\{result\.resultActions\.links\.nextRankedHref\}>Play again<\/a>/);
    assert.doesNotMatch(gameplaySource, /rematch|Create rematch/i);
    assert.doesNotMatch(gameplaySource, /result\.answer|answerWordHash|answerWordSaltRef/);
  });

  it('uses a normal encoded result link for terminal Speed state without exposing hidden authority', () => {
    assert.match(speedSource, /terminal \? <a[^>]*href=\{`\/matches\/\$\{encodeURIComponent\(snapshot\.matchId\)\}`\}[^>]*>Load authoritative result<\/a>/);
    assert.doesNotMatch(speedSource, /terminal \? <button[\s\S]*window\.location\.reload/);
    assert.doesNotMatch(speedSource, /answerWordHash|answerWordSaltRef|opponent.*solveElapsedMs/i);
  });

  it('is permanently included in the web test script', () => {
    assert.match(webPackage.scripts.test, /src\/components\/ranked-completion-flow\.test\.ts/);
  });
});
