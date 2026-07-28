import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { publicDeploymentRevision } from '../src/shared/deployment-revision.ts';

describe('public deployment revision', () => {
  it('reports the first valid provider/source revision without exposing arbitrary environment text', () => {
    assert.equal(publicDeploymentRevision({
      RAILWAY_GIT_COMMIT_SHA: '2222222222222222222222222222222222222222',
      GIT_COMMIT_SHA: '3333333333333333333333333333333333333333',
    }), '2222222222222222222222222222222222222222');
    assert.equal(publicDeploymentRevision({ VERCEL_GIT_COMMIT_SHA: 'ABCDEF1234567' }), 'abcdef1234567');
    assert.equal(publicDeploymentRevision({ GIT_COMMIT_SHA: 'not-a-revision or secret-shaped text' }), 'unavailable');
    assert.equal(publicDeploymentRevision({}), 'development');
  });
});
