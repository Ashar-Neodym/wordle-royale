import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { APPLICATION_METADATA, APPLICATION_VIEWPORT } from './application-metadata.ts';

describe('Wordle Royale application metadata', () => {
  it('publishes concise brand and theme metadata without internal details', () => {
    assert.equal(APPLICATION_METADATA.title, 'Wordle Royale');
    assert.equal(
      APPLICATION_METADATA.description,
      'Rated, server-authoritative word games with live Standard matchmaking.',
    );
    assert.equal(APPLICATION_METADATA.applicationName, 'Wordle Royale');
    assert.equal(APPLICATION_METADATA.icons, undefined);
    assert.equal(APPLICATION_VIEWPORT.themeColor, '#769656');
    assert.equal(APPLICATION_VIEWPORT.colorScheme, 'dark');

    const publicMetadata = JSON.stringify({
      metadata: APPLICATION_METADATA,
      viewport: APPLICATION_VIEWPORT,
    });
    assert.doesNotMatch(
      publicMetadata,
      /DATABASE_URL|REDIS_URL|localhost|127\.0\.0\.1|answer|salt|internal environment/i,
    );
  });

  it('owns a valid single-image 32px favicon in the Next app directory', () => {
    const favicon = readFileSync(new URL('../app/favicon.ico', import.meta.url));
    assert.deepEqual([...favicon.subarray(0, 4)], [0, 0, 1, 0]);
    assert.equal(favicon.readUInt16LE(4), 1);
    assert.equal(favicon[6], 32);
    assert.equal(favicon[7], 32);
    assert.ok(favicon.length > 100);
  });
});
