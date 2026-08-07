import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { AuthPresentationConfiguration } from './auth-presentation.ts';
import {
  ACCOUNT_ACTIONS_DISABLED_PATH,
  PREVIEW_DEMO_ACTION_UNAVAILABLE_PATH,
  SERVER_ACTION_UNAVAILABLE_CODE,
  SERVER_ACTION_UNAVAILABLE_MESSAGE,
  runApiClientServerAction,
  runOperationalServerAction,
  runPreviewDemoServerAction,
} from './server-action-presentation.ts';

const disabled = { status: 'configured', appEnvironment: 'production', mode: 'disabled', registrationMode: null } as const;
const preview = { status: 'configured', appEnvironment: 'preview', mode: 'preview_demo', registrationMode: null } as const;
const durable = { status: 'configured', appEnvironment: 'production', mode: 'durable', registrationMode: 'closed' } as const;
type Configured = Extract<AuthPresentationConfiguration, { status: 'configured' }>;

const rankedApiActions = [
  'createStandard1v1TicketAction',
  'getCurrentStandard1v1TicketAction',
  'getStandard1v1TicketAction',
  'cancelStandard1v1TicketAction',
  'createSpeed1v1TicketAction',
  'getCurrentSpeed1v1TicketAction',
  'getSpeed1v1TicketAction',
  'cancelSpeed1v1TicketAction',
  'getSpeedMatchStateAction',
  'getSpeedMatchRecoveryStateAction',
  'markSpeedMatchReadyAction',
  'forfeitSpeedMatchAction',
  'submitSpeedGuessAction',
] as const;
const rankedRedirectActions = [
  'createRankedLobbyAction',
  'joinLobbyByCodeAction',
  'joinLobbyAction',
  'startRankedMatchAction',
  'submitRankedGuessAction',
  'completeRankedMatchAction',
] as const;
const previewActions = ['startPreviewDemoSessionAction'] as const;
const accountActions = ['registerAccountAction', 'loginAccountAction', 'logoutAccountAction'] as const;

function resolver(configuration: Configured, reads: { count: number }) {
  return () => {
    reads.count += 1;
    return configuration;
  };
}

function exportedActions(source: string): string[] {
  return [...source.matchAll(/export async function (\w+Action)\(/gu)].map((match) => match[1] ?? '');
}

function assertFirstStatementUses(source: string, action: string, helper: string): void {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  assert.match(source, new RegExp(`export async function ${escaped}\\([^]*?\\{\\s*return ${helper}\\(`, 'u'), `${action} must enter ${helper} on its first executable line`);
}

function readTrap(): never {
  const work = {
    get api(): never { throw new Error('API trap reached'); },
    get headers(): never { throw new Error('headers trap reached'); },
    get cookies(): never { throw new Error('cookies trap reached'); },
    get randomUUID(): never { throw new Error('random UUID trap reached'); },
    get now(): never { throw new Error('time trap reached'); },
    get formData(): never { throw new Error('FormData trap reached'); },
    get apiOrigin(): never { throw new Error('API origin trap reached'); },
  };
  return work.api ?? work.headers ?? work.cookies ?? work.randomUUID ?? work.now ?? work.formData ?? work.apiOrigin;
}

describe('server action presentation gate', () => {
  for (const action of [...rankedApiActions, ...rankedRedirectActions, ...accountActions]) {
    it(`${action} fails closed without operational work`, async () => {
      const reads = { count: 0 };
      let disabledCalls = 0;
      const result = await runOperationalServerAction(
        () => readTrap(),
        () => { disabledCalls += 1; return ACCOUNT_ACTIONS_DISABLED_PATH; },
        resolver(disabled, reads),
      );
      assert.equal(result, ACCOUNT_ACTIONS_DISABLED_PATH);
      assert.equal(reads.count, 1);
      assert.equal(disabledCalls, 1);
    });
  }

  for (const [name, configuration] of [['preview_demo', preview], ['durable', durable]] as const) {
    it(`${name} resolves an operational loader exactly once`, async () => {
      const reads = { count: 0 };
      let operationalCalls = 0;
      const sentinel = Symbol(name);
      const result = await runOperationalServerAction(
        (presentation) => { operationalCalls += 1; assert.equal(presentation.mode, name); return sentinel; },
        () => { throw new Error('disabled callback reached'); },
        resolver(configuration, reads),
      );
      assert.equal(result, sentinel);
      assert.equal(reads.count, 1);
      assert.equal(operationalCalls, 1);
    });
  }

  it('returns a deterministic unavailable API result without resolving an API origin', async () => {
    const result = await runApiClientServerAction(() => readTrap(), () => disabled);
    assert.deepEqual(result, {
      status: 'unavailable', apiUrl: '', data: null, requestId: null,
      error: SERVER_ACTION_UNAVAILABLE_MESSAGE, errorCode: SERVER_ACTION_UNAVAILABLE_CODE,
    });
  });

  it('keeps preview-demo start narrower and mode-first', async () => {
    let calls = 0;
    const unavailable = await runPreviewDemoServerAction(() => readTrap(), () => PREVIEW_DEMO_ACTION_UNAVAILABLE_PATH, () => durable);
    assert.equal(unavailable, PREVIEW_DEMO_ACTION_UNAVAILABLE_PATH);
    const result = await runPreviewDemoServerAction(() => { calls += 1; return 'started'; }, () => readTrap(), () => preview);
    assert.equal(result, 'started');
    assert.equal(calls, 1);
  });
});

describe('server action guard manifest', () => {
  it('enumerates every ranked/preview export and binds its first statement to the correct gate', () => {
    const source = readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
    const manifest = [...previewActions, ...rankedApiActions, ...rankedRedirectActions];
    assert.deepEqual(exportedActions(source).sort(), [...manifest].sort());
    for (const action of previewActions) assertFirstStatementUses(source, action, 'runPreviewDemoServerAction');
    for (const action of rankedApiActions) assertFirstStatementUses(source, action, 'runApiClientServerAction');
    for (const action of rankedRedirectActions) assertFirstStatementUses(source, action, 'runOperationalServerAction');
  });

  it('enumerates every account export and gates before FormData, headers, cookies, or durable auth', () => {
    const source = readFileSync(new URL('../app/account/actions.ts', import.meta.url), 'utf8');
    assert.deepEqual(exportedActions(source).sort(), [...accountActions].sort());
    for (const action of accountActions) assertFirstStatementUses(source, action, 'runOperationalServerAction');
    assert.match(source, new RegExp(`redirect\\(ACCOUNT_ACTIONS_DISABLED_PATH\\)`, 'u'));
  });
});
