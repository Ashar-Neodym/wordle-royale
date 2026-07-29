import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { publicWebIdentity } from './public-web-identity.ts';

describe('public web identity', () => {
  it('returns only the full serving revision and nonsecret Wordle presentation values', () => {
    const identity = publicWebIdentity({
      NODE_ENV: 'production', GIT_COMMIT_SHA: 'a'.repeat(40), WORDLE_WEB_ENV: 'production',
      WORDLE_ACCOUNT_MODE: 'durable', WORDLE_REGISTRATION_MODE: 'canary',
      DATABASE_URL: 'postgresql://secret@example.invalid/db', API_BASE_URL: 'https://private.invalid',
    });
    assert.deepEqual(identity, { revision: 'a'.repeat(40), appEnvironment: 'production', mode: 'durable', registrationMode: 'canary' });
    assert.deepEqual(Object.keys(identity).sort(), ['appEnvironment','mode','registrationMode','revision']);
    assert.doesNotMatch(JSON.stringify(identity), /secret|database|api_base|origin|gate/iu);
  });
  it('rejects missing, short, or invalid serving revisions', () => {
    const base = { NODE_ENV: 'production' as const, WORDLE_WEB_ENV: 'production', WORDLE_ACCOUNT_MODE: 'durable', WORDLE_REGISTRATION_MODE: 'canary' };
    assert.throws(() => publicWebIdentity(base), /full serving web revision/u);
    assert.throws(() => publicWebIdentity({ ...base, GIT_COMMIT_SHA: 'abcdef1' }), /full serving web revision/u);
  });
});
