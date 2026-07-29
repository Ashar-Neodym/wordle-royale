import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DurableAuthResult } from '../../lib/durable-auth-bff.ts';
import { accountActionNotice, accountResultMessages, FIXED_SAFE_ACCOUNT_RESULT_CODES } from './account-result.ts';

const signedOut: DurableAuthResult = { status: 'signed_out', code: 'not_authenticated', message: 'Sign in.' };
const unavailable: DurableAuthResult = { status: 'unavailable', code: 'auth_transport_unavailable', message: 'Unavailable.' };
const authenticated: DurableAuthResult = {
  status: 'success', code: 'authenticated', message: 'Signed in.',
  user: { email: null, handle: 'player', displayName: 'Player' },
};

describe('account action result presentation', () => {
  it('suppresses forged or stale success query parameters unless /auth/me confirms them', () => {
    assert.equal(accountActionNotice('authenticated', signedOut), undefined);
    assert.equal(accountActionNotice('authenticated', unavailable), undefined);
    assert.equal(accountActionNotice('signed_out', authenticated), undefined);
    assert.equal(accountActionNotice('authenticated', authenticated)?.tone, 'success');
    assert.equal(accountActionNotice('signed_out', signedOut)?.tone, 'success');
  });

  it('maps every fixed safe BFF result code without reflecting arbitrary query content', () => {
    assert.ok(FIXED_SAFE_ACCOUNT_RESULT_CODES.length > 0);
    for (const code of FIXED_SAFE_ACCOUNT_RESULT_CODES) {
      const state: DurableAuthResult = code === 'authenticated' ? authenticated : code === 'signed_out' ? signedOut : unavailable;
      assert.ok(accountActionNotice(code, state), `missing presentation for ${code}`);
    }
    assert.equal(Object.keys(accountResultMessages).length, FIXED_SAFE_ACCOUNT_RESULT_CODES.length);
    assert.equal(accountActionNotice('private-token-or-password', authenticated), undefined);
  });
});
