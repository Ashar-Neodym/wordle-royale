import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getWebApiSnapshot } from './api-client.ts';
import { currentProfilePageTitle, leaderboardDisplayMode, type ReadStatus } from './profile-read-presentation.ts';

function connectedEnvelope(data: unknown = null): Response {
  return new Response(JSON.stringify({ data, error: null, requestId: 'ticket-155' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('generic profile and leaderboard identity presentation', () => {
  it('does not request a hard-coded rated profile in the generic web snapshot', async () => {
    const originalFetch = globalThis.fetch;
    const paths: string[] = [];
    globalThis.fetch = async (input) => {
      paths.push(new URL(String(input)).pathname);
      return connectedEnvelope();
    };

    try {
      const snapshot = await getWebApiSnapshot();
      assert.deepEqual(paths.sort(), [
        '/auth/me',
        '/healthz',
        '/leaderboard',
        '/lobbies',
        '/profile/me',
        '/readyz',
      ]);
      assert.equal(paths.some((path) => path.startsWith('/profiles/')), false);
      assert.equal('ratedProfile' in snapshot, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps unrelated rated-profile state out of every partial-failure combination', () => {
    const states: ReadStatus[] = ['connected', 'unavailable'];
    let combinations = 0;

    for (const currentProfileStatus of states) {
      for (const unrelatedRatedProfileStatus of states) {
        for (const leaderboardStatus of states) {
          combinations += 1;
          const currentProfile = currentProfileStatus === 'connected'
            ? { displayName: 'Current Player' }
            : null;
          const unrelatedRatedProfile = unrelatedRatedProfileStatus === 'connected'
            ? { displayName: 'Alice Fixture' }
            : null;

          const heading = currentProfilePageTitle(currentProfile, false);
          const leaderboardMode = leaderboardDisplayMode(leaderboardStatus, 0);

          assert.equal(
            heading,
            currentProfile ? 'Current Player' : 'Preview player',
            `${currentProfileStatus}/${unrelatedRatedProfileStatus}/${leaderboardStatus}`,
          );
          assert.notEqual(heading, unrelatedRatedProfile?.displayName ?? 'Alice Fixture');
          assert.equal(leaderboardMode === 'fixture_preview', leaderboardStatus === 'connected');
          assert.equal(leaderboardMode === 'unavailable', leaderboardStatus === 'unavailable');
        }
      }
    }

    assert.equal(combinations, 8);
  });

  it('shows live rows only for a connected non-empty leaderboard', () => {
    assert.equal(leaderboardDisplayMode('connected', 3), 'live');
    assert.equal(leaderboardDisplayMode('connected', 0), 'fixture_preview');
    assert.equal(leaderboardDisplayMode('unavailable', 3), 'unavailable');
  });

  it('uses session-neutral headings when the current profile is unavailable', () => {
    assert.equal(currentProfilePageTitle(null, false), 'Preview player');
    assert.equal(currentProfilePageTitle(null, true), 'Preview profile');
    assert.equal(currentProfilePageTitle({ displayName: 'Authenticated Player' }, false), 'Authenticated Player');
  });
});
