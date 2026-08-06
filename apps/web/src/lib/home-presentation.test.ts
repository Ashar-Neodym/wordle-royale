import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveHomePresentation } from './home-presentation.ts';

const disabled = { status: 'configured', appEnvironment: 'production', mode: 'disabled', registrationMode: null } as const;
const preview = { status: 'configured', appEnvironment: 'preview', mode: 'preview_demo', registrationMode: null } as const;
const durable = { status: 'configured', appEnvironment: 'production', mode: 'durable', registrationMode: 'closed' } as const;

describe('Home presentation resolver', () => {
  it('returns disabled landing mode without reading an API snapshot, repeatedly and independent of hostile input', async () => {
    let reads = 0;
    const loadSnapshot = async () => { reads += 1; throw new Error('API trap was read'); };
    for (const hostileQuery of ['?mode=durable', '?WORDLE_ACCOUNT_MODE=preview_demo', '?mode=disabled&mode=durable']) {
      void hostileQuery;
      assert.deepEqual(await resolveHomePresentation(() => disabled, loadSnapshot), {
        kind: 'disabled', presentation: disabled,
      });
    }
    assert.equal(reads, 0);
  });

  it('resolves strict auth before attempting any snapshot', async () => {
    const order: string[] = [];
    await assert.rejects(
      resolveHomePresentation(
        () => { order.push('auth'); throw new Error('invalid auth'); },
        async () => { order.push('snapshot'); return { sentinel: true }; },
      ),
      /invalid auth/,
    );
    assert.deepEqual(order, ['auth']);
  });

  it('loads the existing snapshot exactly once in preview demo and durable modes', async () => {
    for (const presentation of [preview, durable]) {
      let reads = 0;
      const snapshot = { sentinel: presentation.mode };
      const result = await resolveHomePresentation(() => presentation, async () => {
        reads += 1;
        return snapshot;
      });
      assert.equal(reads, 1);
      assert.deepEqual(result, { kind: 'operational', presentation, api: snapshot });
    }
  });
});
