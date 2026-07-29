import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  WORDLE_ACCOUNT_MODES,
  WORDLE_REGISTRATION_MODES,
  resolveAuthPresentationConfiguration,
  WEB_APP_ENVIRONMENTS,
} from './auth-presentation.ts';

const API = 'https://api.example.test';
const WEB = 'https://play.example.test';

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'production',
    WORDLE_WEB_ENV: 'production',
    WORDLE_ACCOUNT_MODE: 'durable',
    WORDLE_REGISTRATION_MODE: 'closed',
    ...overrides,
  };
}

describe('server auth presentation configuration', () => {
  it('accepts the neutral preview aliases derived by the build boundary', () => {
    assert.deepEqual(resolveAuthPresentationConfiguration({ WORDLE_WEB_ENV: 'preview', WORDLE_ACCOUNT_MODE: 'preview_demo' }), {
      status: 'configured', appEnvironment: 'preview', mode: 'preview_demo', registrationMode: null,
    });
    assert.equal(resolveAuthPresentationConfiguration({}).status, 'invalid');
  });

  it('accepts only the complete valid truth table', () => {
    const registrationInputs = [undefined, ...WORDLE_REGISTRATION_MODES] as const;
    for (const appEnvironment of WEB_APP_ENVIRONMENTS) {
      for (const mode of WORDLE_ACCOUNT_MODES) {
        for (const registrationMode of registrationInputs) {
          const config = resolveAuthPresentationConfiguration(environment({
            WORDLE_WEB_ENV: appEnvironment,
            WORDLE_ACCOUNT_MODE: mode,
            WORDLE_REGISTRATION_MODE: registrationMode,
          }));
          const expected = (appEnvironment === 'preview' && mode === 'preview_demo' && registrationMode === undefined)
            || (appEnvironment === 'production' && mode === 'disabled' && registrationMode === undefined)
            || (appEnvironment === 'production' && mode === 'durable' && registrationMode !== undefined);
          assert.equal(config.status === 'configured', expected,
            JSON.stringify({ appEnvironment, mode, registrationMode, config }));
        }
      }
    }
  });

  it('rejects unknown, partial, ambiguous, and non-exact values', () => {
    const cases = [
      environment({ WORDLE_WEB_ENV: 'demo' }),
      environment({ WORDLE_ACCOUNT_MODE: 'DURABLE' }),
      environment({ WORDLE_REGISTRATION_MODE: 'public' }),
      environment({ WORDLE_WEB_ENV: undefined }),
      environment({ WORDLE_ACCOUNT_MODE: undefined }),
    ];
    for (const candidate of cases) assert.equal(resolveAuthPresentationConfiguration(candidate).status, 'invalid');
  });

  it('returns registration mode only, never a canary digest or environment secrets', () => {
    const config = resolveAuthPresentationConfiguration(environment({
      WORDLE_REGISTRATION_MODE: 'canary',
      AUTH_CANARY_EMAIL_DIGEST: 'must-not-be-read-by-web',
    }));
    assert.equal(config.status, 'configured');
    assert.equal(config.status === 'configured' ? config.registrationMode : null, 'canary');
    assert.doesNotMatch(JSON.stringify(config), /must-not-be-read|digest/i);
  });
});
