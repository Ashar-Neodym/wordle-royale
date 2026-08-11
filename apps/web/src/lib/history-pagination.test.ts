import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getMatchHistory } from './api-client.ts';
import { historyContinuationHref } from './history-pagination.ts';

describe('history continuation presentation', () => {
  it('builds an encoded continuation URL for the accessible control', () => {
    const cursor = 'opaque+/= cursor';
    const href = historyContinuationHref(cursor);
    assert.equal(href, '/history?cursor=opaque%2B%2F%3D+cursor');
    assert.equal(new URL(href, 'https://example.test').searchParams.get('cursor'), cursor);
  });

  it('forwards a continuation cursor to the history API', async () => {
    const originalFetch = globalThis.fetch;
    let requested = '';
    globalThis.fetch = async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({ data: { items: [], pagination: { nextCursor: null } }, error: null, requestId: 'history-test' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    try {
      await getMatchHistory(20, 'opaque+/= cursor');
      const url = new URL(requested);
      assert.equal(url.pathname, '/matches/history/me');
      assert.equal(url.searchParams.get('limit'), '20');
      assert.equal(url.searchParams.get('cursor'), 'opaque+/= cursor');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});