import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listLobbies } from './api-client.ts';
import { lobbyContinuationHref } from './lobby-pagination.ts';

describe('lobby continuation presentation', () => {
  it('encodes opaque cursors and preserves a safe join code', () => {
    const href = lobbyContinuationHref('opaque+/= cursor', 'ABC123');
    const url = new URL(href, 'https://example.test');
    assert.equal(url.pathname, '/lobbies');
    assert.equal(url.searchParams.get('cursor'), 'opaque+/= cursor');
    assert.equal(url.searchParams.get('code'), 'ABC123');
  });

  it('forwards a continuation cursor to the lobby API', async () => {
    const originalFetch = globalThis.fetch;
    const originalWebEnvironment = process.env.WORDLE_WEB_ENV;
    const originalApiUrl = process.env.WORDLE_API_URL;
    let requested = '';
    process.env.WORDLE_WEB_ENV = 'preview';
    process.env.WORDLE_API_URL = 'https://api.example.test';
    globalThis.fetch = async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({ data: { items: [], pagination: { nextCursor: null } }, error: null, requestId: 'req' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    };
    try {
      await listLobbies(20, 'opaque+/= cursor');
      const url = new URL(requested);
      assert.equal(url.pathname, '/lobbies');
      assert.equal(url.searchParams.get('limit'), '20');
      assert.equal(url.searchParams.get('cursor'), 'opaque+/= cursor');
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWebEnvironment === undefined) delete process.env.WORDLE_WEB_ENV;
      else process.env.WORDLE_WEB_ENV = originalWebEnvironment;
      if (originalApiUrl === undefined) delete process.env.WORDLE_API_URL;
      else process.env.WORDLE_API_URL = originalApiUrl;
    }
  });
});