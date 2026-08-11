import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('operational ranked presentation invariants', () => {
  const operationalSources = [
    './GameplayScreen.tsx',
    './LobbyScreens.tsx',
    './ReportAndProfile.tsx',
    '../app/page.tsx',
    '../app/play/page.tsx',
    '../app/lobbies/page.tsx',
    '../app/leaderboard/page.tsx',
  ].map(source);

  it('does not import fixture packages or fixture adapters into operational ranked surfaces', () => {
    for (const rankedSource of operationalSources) {
      assert.doesNotMatch(rankedSource, /@wordle-royale\/fixtures|(?:\.\.\/)+lib\/fixtures/u);
    }
    assert.match(source('./PracticeGame.tsx'), /practice-game/u);
    assert.match(source('./ChallengeGame.tsx'), /challenge-persistence/u);
  });

  it('keeps empty and unavailable ranked reads honest', () => {
    const lobby = source('./LobbyScreens.tsx');
    const leaderboard = source('./ReportAndProfile.tsx');
    const gameplay = source('./GameplayScreen.tsx');
    assert.match(lobby, /There are no open rooms/u);
    assert.match(lobby, /No room list is being substituted/u);
    assert.doesNotMatch(lobby, /Crown room|Fixture fallback|fixtureLobbies/u);
    assert.match(leaderboard, /No authoritative standings were returned/u);
    assert.doesNotMatch(leaderboard, /fixtureRows|leaderboardFixtures/u);
    assert.match(gameplay, /No ranked match open/u);
    assert.doesNotMatch(gameplay, /gameplayFixtures|Fixture word grid/u);
  });

  it('fails Standard actions closed unless the authoritative catalog verifies availability', () => {
    const play = source('../app/play/page.tsx');
    const standard = source('./StandardQueuePanel.tsx');
    assert.match(play, /rankedModes\.status === 'connected'/u);
    assert.match(play, /availabilityVerified=\{standardAvailable\}/u);
    assert.match(standard, /if \(!availabilityVerified\)/u);
    assert.match(standard, /No queue action is offered/u);
  });

  it('never invents Speed outcomes or profile chart values', () => {
    const gameplay = source('./GameplayScreen.tsx');
    const matchDetail = source('../app/matches/[matchId]/page.tsx');
    const profile = source('./ProfileHistory.tsx');
    for (const rankedSource of [gameplay, matchDetail]) {
      assert.doesNotMatch(rankedSource, /result \?\? 'void'|terminalReason \?\? 'resolved'/u);
      assert.match(rankedSource, /result unavailable/u);
      assert.match(rankedSource, /terminal reason unavailable/u);
    }
    assert.doesNotMatch(profile, /ratingDelta \?\? 0|\[rating\.rating, rating\.rating, rating\.rating\]/u);
    assert.match(profile, /: null;/u);
    assert.match(profile, /role="img" aria-label=\{`Rating history:/u);
    assert.match(profile, /aria-hidden="true"/u);
  });
});