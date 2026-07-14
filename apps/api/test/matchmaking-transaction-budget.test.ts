import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_MATCHMAKING_TRANSACTION_MAX_WAIT_MS,
  DEFAULT_MATCHMAKING_TRANSACTION_TIMEOUT_MS,
  MAX_MATCHMAKING_TRANSACTION_MAX_WAIT_MS,
  MAX_MATCHMAKING_TRANSACTION_TIMEOUT_MS,
  matchmakingTransactionBudget,
} from '../src/matchmaking/matchmaking-transaction-budget.ts';

describe('matchmaking transaction budget configuration', () => {
  it('uses explicit bounded hosted-safe defaults', () => {
    assert.deepEqual(matchmakingTransactionBudget({}), {
      maxWait: DEFAULT_MATCHMAKING_TRANSACTION_MAX_WAIT_MS,
      timeout: DEFAULT_MATCHMAKING_TRANSACTION_TIMEOUT_MS,
    });
    assert.deepEqual(matchmakingTransactionBudget({
      MATCHMAKING_TRANSACTION_MAX_WAIT_MS: String(MAX_MATCHMAKING_TRANSACTION_MAX_WAIT_MS),
      MATCHMAKING_TRANSACTION_TIMEOUT_MS: String(MAX_MATCHMAKING_TRANSACTION_TIMEOUT_MS),
    }), {
      maxWait: MAX_MATCHMAKING_TRANSACTION_MAX_WAIT_MS,
      timeout: MAX_MATCHMAKING_TRANSACTION_TIMEOUT_MS,
    });
  });

  it('rejects malformed, too-small, and unbounded values without echoing input', () => {
    for (const [variable, value] of [
      ['MATCHMAKING_TRANSACTION_MAX_WAIT_MS', '999'],
      ['MATCHMAKING_TRANSACTION_MAX_WAIT_MS', '10001'],
      ['MATCHMAKING_TRANSACTION_TIMEOUT_MS', '5999'],
      ['MATCHMAKING_TRANSACTION_TIMEOUT_MS', '30001'],
      ['MATCHMAKING_TRANSACTION_TIMEOUT_MS', 'not-a-number-secret'],
    ] as const) {
      assert.throws(
        () => matchmakingTransactionBudget({ [variable]: value }),
        (error: any) => error.name === 'MatchmakingTransactionConfigError'
          && error.message.includes(variable)
          && !error.message.includes(value),
      );
    }
  });
});
