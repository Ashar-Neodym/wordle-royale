import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  disabledPlayPresentation,
  resolvePlayPagePresentation,
} from './play-page-presentation.ts';

const webPackage = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
  scripts: { test: string };
};

describe('/play account-mode presentation', () => {
  it('short-circuits disabled mode before search parameters or ranked API reads, including match links', async () => {
    const calls: string[] = [];
    const result = await resolvePlayPagePresentation('disabled', {
      resolveSearchParams: async () => {
        calls.push('searchParams');
        return new URLSearchParams('matchId=must-not-bypass');
      },
      readRankedWorkspace: async () => {
        calls.push('apiRead');
        return { composition: 'ranked workspace' };
      },
    });

    assert.deepEqual(calls, []);
    assert.deepEqual(result, { kind: 'practice', content: disabledPlayPresentation });
    assert.equal('workspace' in result, false);
  });

  it('keeps the disabled view concise, practice-first, and explicit about local play', () => {
    assert.deepEqual(disabledPlayPresentation, {
      eyebrow: 'Play now',
      title: 'Practice is ready',
      description: 'Play a complete Wordle game immediately as a guest—no account needed.',
      facts: [
        'Practice is local and not rated.',
        'Your progress and stats are saved on this device.',
      ],
      primaryAction: { href: '/practice', label: 'Play practice' },
      secondaryActions: [
        { href: '/learn/rules', label: 'Rules' },
        { href: '/', label: 'Home' },
      ],
    });
    assert.equal(disabledPlayPresentation.facts.length, 2);
    assert.equal(disabledPlayPresentation.secondaryActions.length, 2);
  });

  it('loads and preserves ranked workspace composition for preview_demo and durable modes', async () => {
    for (const mode of ['preview_demo', 'durable'] as const) {
      const calls: string[] = [];
      const params = new URLSearchParams('matchId=ranked-match');
      const workspace = { composition: 'ranked workspace', mode };
      const result = await resolvePlayPagePresentation(mode, {
        resolveSearchParams: async () => {
          calls.push('searchParams');
          return params;
        },
        readRankedWorkspace: async (resolved) => {
          calls.push('apiRead');
          assert.equal(resolved, params);
          return workspace;
        },
      });

      assert.deepEqual(calls, ['searchParams', 'apiRead']);
      assert.deepEqual(result, { kind: 'ranked', workspace });
    }
  });

  it('is permanently included in the executed web test script', () => {
    assert.equal(webPackage.scripts.test, 'node scripts/run-tests.mjs');
  });
});
