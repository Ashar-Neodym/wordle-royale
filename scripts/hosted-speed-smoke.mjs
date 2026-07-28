#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { runHostedSpeedSmoke, ROUTES } from './hosted-speed-smoke-core.mjs';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in the caller environment`);
  return value;
}
if (!process.argv.includes('--confirm-one-hosted-lifecycle')) {
  console.error('Refusing stateful execution without --confirm-one-hosted-lifecycle');
  process.exit(2);
}

const baseUrl = new URL(required('SPEED_SMOKE_API_BASE_URL'));
const expectedRevision = required('SPEED_SMOKE_EXPECTED_REVISION');
const callerAuthorization = process.env.SPEED_SMOKE_AUTHORIZATION;
const cookies = new Map();

const transport = {
  async request({ actor, method, path, body }) {
    const controller = new AbortController();
    const started = performance.now();
    const timer = setTimeout(() => controller.abort(), 35_000);
    try {
      const headers = { accept: 'application/json' };
      if (body) headers['content-type'] = 'application/json';
      if (callerAuthorization) headers.authorization = callerAuthorization;
      if (actor && cookies.has(actor)) headers.cookie = cookies.get(actor);
      const response = await fetch(new URL(path, baseUrl), { method, headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal, redirect: 'error' });
      let sessionIdentity;
      if (path === ROUTES.session && actor) {
        const setCookies = response.headers.getSetCookie?.() ?? (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
        const cookie = setCookies[0]?.split(';', 1)[0];
        if (cookie) { cookies.set(actor, cookie); sessionIdentity = cookie; }
      }
      let responseBody = null;
      try { responseBody = await response.json(); } catch { /* Evidence records status only. */ }
      return { status: response.status, durationMs: performance.now() - started, body: responseBody, ...(sessionIdentity ? { sessionIdentity } : {}) };
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeout = new Error('request timed out'); timeout.name = 'TimeoutError'; timeout.code = 'TIMEOUT'; timeout.durationMs = performance.now() - started; throw timeout;
      }
      throw error;
    } finally { clearTimeout(timer); }
  },
};

const evidence = await runHostedSpeedSmoke({
  transport,
  expectedRevision,
  operationIds: [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()],
});
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
process.exitCode = evidence.result === 'PASS' ? 0 : 1;
