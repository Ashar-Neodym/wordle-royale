import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const account = readFileSync(new URL('../app/account/page.tsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const frame = readFileSync(new URL('./PageFrame.tsx', import.meta.url), 'utf8');
const lobby = readFileSync(new URL('./LobbyScreens.tsx', import.meta.url), 'utf8');
const action = readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');

describe('auth presentation UI boundaries', () => {
  it('keeps preview demo copy and action explicitly temporary and password-free', () => {
    assert.match(account, /Temporary preview identity/);
    assert.match(account, /No email or password is required/);
    assert.match(account, /Start preview demo/);
    assert.match(frame, /Demo sessions only — no durable accounts/);
    assert.match(home, /This is not a durable account/);
  });

  it('renders dormant production without login, registration, password, or demo forms', () => {
    assert.match(account, /presentation\.mode === 'disabled'.*<DisabledAccount/s);
    assert.match(account, /No account actions are available/);
    assert.match(account, /account access is disabled/);
    assert.match(frame, /Account access is currently unavailable/);
    assert.match(home, /Account actions are disabled/);
  });

  it('makes durable closed, canary, and open registration promises distinct', () => {
    assert.match(account, /Controlled canary registration/);
    assert.match(account, /Public signup is not open/);
    assert.match(account, /Registration closed/);
    assert.match(account, /Public registration is open/);
    assert.match(account, /registrationMode === 'open'.*<form className=\{styles\.accountForm\} action=\{registerAccountAction\}/s);
    assert.match(frame, /Registration is limited to a controlled canary/);
  });

  it('gates preview and lobby entry actions by the centralized presentation mode', () => {
    assert.match(action, /presentation\.mode !== 'preview_demo'/);
    assert.match(lobby, /authPresentationMode === 'preview_demo'/);
    assert.match(lobby, /authPresentationMode === 'durable'/);
    assert.match(lobby, /Lobby writes are unavailable/);
  });

  it('does not reference canary digests, tokens, or raw cookie values in presentation components', () => {
    for (const source of [account, home, frame, lobby]) {
      assert.doesNotMatch(source, /AUTH_CANARY|CANARY_EMAIL|digest|accessToken|refreshToken|\.value\b/i);
    }
  });
});
