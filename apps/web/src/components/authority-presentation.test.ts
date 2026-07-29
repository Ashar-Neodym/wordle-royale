import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { speedQueueCopy } from './speed-live-state.ts';

const panelSource = readFileSync(new URL('./SpeedQueuePanel.tsx', import.meta.url), 'utf8');

describe('Speed authority presentation boundary', () => {
  it('renders configured temporary/unproven authority as unavailable, never disabled', () => {
    const unavailable = speedQueueCopy('authority_unavailable', 'durable');
    assert.equal(unavailable.title, 'Live Speed availability could not be verified');
    assert.match(unavailable.eyebrow, /status unavailable/i);
    assert.doesNotMatch(unavailable.title, /queue is not enabled/i);
    assert.match(panelSource, /state === 'authority_unavailable'.*Retry Speed availability/);
  });

  it('reserves disabled copy for coherent authoritative configuration disablement', () => {
    const disabled = speedQueueCopy('disabled', 'durable');
    assert.equal(disabled.title, 'Speed queue is not enabled');
    assert.doesNotMatch(disabled.title, /could not be verified/i);
    assert.match(panelSource, /!catalogAvailable \? 'authority_unavailable' : !queueEnabled \? 'disabled'/);
  });

  it('keeps Standard presentation source independent from Speed authority state', () => {
    const standardSource = readFileSync(new URL('./StandardQueuePanel.tsx', import.meta.url), 'utf8');
    assert.match(standardSource, /Automatic Standard matchmaking/);
    assert.doesNotMatch(standardSource, /authority_unavailable|Speed status unavailable|Retry Speed availability/);
  });
});
