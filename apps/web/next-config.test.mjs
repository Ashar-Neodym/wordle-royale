import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const configUrl = new URL('./next.config.mjs', import.meta.url).href;
const gateKey = ['DURABLE', 'AUTH', 'ENABLED'].join('_');
const presentationKeys = ['WORDLE_WEB_ENV', 'WORDLE_ACCOUNT_MODE', 'WORDLE_REGISTRATION_MODE'];
const providerKeys = ['VERCEL_ENV'];

function loadConfig(overrides = {}) {
  const env = { ...process.env };
  for (const key of [...presentationKeys, ...providerKeys, gateKey]) delete env[key];
  Object.assign(env, overrides);
  const script = `import(${JSON.stringify(`${configUrl}?case=${Math.random()}`)}).then(m => console.log(JSON.stringify(m.default.env)))`;
  return spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    env,
    encoding: 'utf8',
  });
}

describe('Next build presentation boundary', () => {
  it('derives only neutral preview aliases from the exact legacy false gate', () => {
    const result = loadConfig({ [gateKey]: 'false' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), {
      WORDLE_WEB_ENV: 'preview',
      WORDLE_ACCOUNT_MODE: 'preview_demo',
    });
  });

  it('derives neutral preview aliases from an unconfigured Vercel preview only', () => {
    const result = loadConfig({ VERCEL_ENV: 'preview' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), {
      WORDLE_WEB_ENV: 'preview',
      WORDLE_ACCOUNT_MODE: 'preview_demo',
    });
  });

  it('rejects absent, invalid, partial, contradictory, and non-preview Vercel modes at config load', () => {
    const cases = [
      {},
      { VERCEL_ENV: 'production' },
      { VERCEL_ENV: 'development' },
      { VERCEL_ENV: 'preview', [gateKey]: 'true' },
      { VERCEL_ENV: 'preview', [gateKey]: 'true', WORDLE_WEB_ENV: 'production', WORDLE_ACCOUNT_MODE: 'durable', WORDLE_REGISTRATION_MODE: 'closed' },
      { [gateKey]: 'FALSE' },
      { [gateKey]: 'true' },
      { [gateKey]: 'false', WORDLE_WEB_ENV: 'production' },
      { [gateKey]: 'true', WORDLE_WEB_ENV: 'production', WORDLE_ACCOUNT_MODE: 'disabled' },
      { [gateKey]: 'false', WORDLE_WEB_ENV: 'production', WORDLE_ACCOUNT_MODE: 'durable', WORDLE_REGISTRATION_MODE: 'open' },
      { [gateKey]: 'true', WORDLE_WEB_ENV: 'production', WORDLE_ACCOUNT_MODE: 'durable', WORDLE_REGISTRATION_MODE: 'public' },
    ];
    for (const candidate of cases) {
      const result = loadConfig(candidate);
      assert.notEqual(result.status, 0, JSON.stringify({ candidate, stdout: result.stdout }));
    }
  });

  it('emits no gate, origin, cookie, credential, digest, or rate-limit secret', () => {
    const result = loadConfig({
      [gateKey]: 'true',
      WORDLE_WEB_ENV: 'production',
      WORDLE_ACCOUNT_MODE: 'durable',
      WORDLE_REGISTRATION_MODE: 'canary',
      API_BASE_URL: 'https://api.example.test',
      PUBLIC_WEB_URL: 'https://play.example.test',
      AUTH_CANARY_EMAIL_DIGEST: 'do-not-emit',
      AUTH_RATE_LIMIT_HMAC_KEY: 'do-not-emit',
      COOKIE_SECRET: 'do-not-emit',
    });
    assert.equal(result.status, 0, result.stderr);
    const emitted = JSON.parse(result.stdout.trim());
    assert.deepEqual(emitted, {
      WORDLE_WEB_ENV: 'production',
      WORDLE_ACCOUNT_MODE: 'durable',
      WORDLE_REGISTRATION_MODE: 'canary',
    });
    assert.doesNotMatch(JSON.stringify(emitted), /do-not-emit|origin|cookie|digest|rate|durable_auth/i);
  });
});
