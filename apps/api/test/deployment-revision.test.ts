import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { publicDeploymentRevision } from '../src/shared/deployment-revision.ts';

describe('public deployment revision', () => {
  it('recognizes the Render deployment SHA', () => {
    assert.equal(publicDeploymentRevision({
      RENDER_GIT_COMMIT: ' ABCDEF1234567890ABCDEF1234567890ABCDEF12 ',
    }), 'abcdef1234567890abcdef1234567890abcdef12');
  });

  it('uses provider keys before generic source keys in documented order', () => {
    assert.equal(publicDeploymentRevision({
      RAILWAY_GIT_COMMIT_SHA: '2222222222222222222222222222222222222222',
      RENDER_GIT_COMMIT: '4444444444444444444444444444444444444444',
      VERCEL_GIT_COMMIT_SHA: '5555555555555555555555555555555555555555',
      GIT_COMMIT_SHA: '3333333333333333333333333333333333333333',
    }), '2222222222222222222222222222222222222222');
    assert.equal(publicDeploymentRevision({
      RENDER_GIT_COMMIT: '4444444444444444444444444444444444444444',
      VERCEL_GIT_COMMIT_SHA: '5555555555555555555555555555555555555555',
      GIT_COMMIT_SHA: '3333333333333333333333333333333333333333',
    }), '4444444444444444444444444444444444444444');
    assert.equal(publicDeploymentRevision({ VERCEL_GIT_COMMIT_SHA: 'ABCDEF1234567' }), 'abcdef1234567');
  });

  it('fails closed on malformed selected values without exposing arbitrary environment text', () => {
    assert.equal(publicDeploymentRevision({ GIT_COMMIT_SHA: 'not-a-revision or secret-shaped text' }), 'unavailable');
    assert.equal(publicDeploymentRevision({
      RENDER_GIT_COMMIT: 'not-a-sha',
      GIT_COMMIT_SHA: '3333333333333333333333333333333333333333',
    }), 'unavailable');
  });

  it('uses environment-appropriate fallbacks when no revision is present', () => {
    assert.equal(publicDeploymentRevision({}), 'development');
    assert.equal(publicDeploymentRevision({ NODE_ENV: 'production' }), 'unavailable');
  });
});
