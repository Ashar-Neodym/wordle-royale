# Ticket 183 — Truthful Speed Mutation Recovery and Snapshot Ordering Response

Task: Ticket 183 — Truthful Speed Mutation Recovery and Snapshot Ordering
Agent: Luna (coder)
Status: **Complete; ready for Ticket 188 independent blocker recheck**

## Scope delivered

### Retry truthfulness

- Browser-envelope timeout is now tracked separately from definitive POST settlement.
- A timed-out browser operation retains a settlement promise; timeout no longer means the POST ended.
- Ready and guess expose `retry_safe` only when all required facts are present:
  1. the action response is definitively settled rather than a server-action/transport timeout;
  2. a successful authoritative recovery read, started after settlement, proves the exact operation absent;
  3. the applicable authoritative deadline is still strictly open.
- Failed/withheld recovery and any POST that may still commit remain `uncertain`; retry controls stay disabled.
- Forfeit never exposes recovery-based retry because the current public snapshot does not expose persisted forfeit operation identity.
- Original ready, guess, and forfeit UUIDs remain retained; no mutation is automatically replayed.

### Snapshot ordering

- Added monotonically increasing local request generations across initial state, polling, recovery reads, and mutation responses.
- A recovery that needs post-settlement evidence cannot reuse an older in-flight poll; it waits for that single-flight read and then starts a newer authoritative recovery.
- Snapshots are rejected when their request generation is older than the latest applied generation.
- Added monotonic lifecycle ranks so equal-time or even later-timestamp responses cannot regress `countdown` to waiting, `in_progress` to countdown, or later phases to earlier phases.
- Existing `serverTime`, match ID, and round ID fences remain in force.

### Operation correlation and terminal truthfulness

- Ready still uses exact `viewerReadyOperationId` in waiting states.
- When correlation is unavailable, `countdown` or `in_progress` plus `viewerReady=true` now confirms a lost ready response.
- A present but mismatched ready operation ID never uses the fallback.
- Guess confirmation remains exact by accepted-guess `clientRequestId`.
- A direct forfeit response confirms that exact operation.
- An unrelated `completed`/`voided` snapshot no longer claims that a pending forfeit caused terminalization; it renders neutral uncertain copy.

### Recovery UX

- Unsafe ready, guess, and forfeit controls render explicit “awaiting authoritative outcome” labels and remain disabled.
- Retry labels appear only with proven `retry_safe` state and reuse the retained UUID.
- Existing polite atomic status semantics, route identity, Standard behavior, and spoiler boundaries are preserved.

## Files changed

- `apps/web/src/components/SpeedGameplayPanel.tsx`
- `apps/web/src/components/speed-live-state.ts`
- `apps/web/src/components/speed-live-state.test.ts`
- `apps/web/src/lib/speed-mutation-policy.ts`
- `apps/web/src/lib/speed-mutation-policy.test.ts`

## TDD evidence

Initial focused run failed as expected:

- missing `speedRetryIsSafe` export;
- browser timeout outcome had no independent settlement handle.

Final focused controller/policy run:

```bash
pnpm exec tsx --test \
  apps/web/src/components/speed-live-state.test.ts \
  apps/web/src/lib/speed-mutation-policy.test.ts
```

Result: exit `0`, **16/16 passed**.

Adversarial coverage includes:

- POST continuing after browser uncertainty;
- failed recovery withholding retry;
- equal-`serverTime` lifecycle regression;
- later-timestamp lifecycle regression;
- older-generation terminal response;
- exact and unavailable-correlation ready confirmation;
- mismatched ready identity;
- deadline equality treated as closed;
- unrelated terminalization not establishing forfeit retry/causality;
- repeated-word guess operation identity.

## Verification

```bash
pnpm exec tsx --test \
  apps/web/src/lib/speed-mutation-policy.test.ts \
  apps/web/src/lib/speed-mutation-api-policy.test.ts \
  apps/web/src/components/speed-live-state.test.ts \
  apps/web/src/lib/server-read-policy.test.ts \
  apps/web/src/components/standard-queue-state.test.ts
pnpm --filter @wordle-royale/contracts test
pnpm --filter @wordle-royale/web typecheck
pnpm --filter @wordle-royale/web build
pnpm validate:workspace
pnpm secret-scan
git diff --check
```

Results:

- focused web suites: exit `0`, **31/31 passed**;
- contracts: exit `0`, **24/24 passed**;
- web typecheck: exit `0`;
- production build: exit `0`;
- workspace validation: exit `0`, **9 packages**;
- secret scan: exit `0`, **255 files**;
- diff check: exit `0`.

## Production-artifact browser evidence

A production Next build was exercised against a deterministic threaded API fixture:

1. The ready POST remained alive for 40 seconds while authoritative recovery GETs were intentionally withheld with HTTP 503.
2. The API-proxy/server-action uncertainty returned before the original backend POST ended.
3. The UI rendered `uncertain`, explicitly stated that safe-retry prerequisites were incomplete, and rendered a disabled `Awaiting authoritative ready outcome` control.
4. Programmatically attempting the disabled control did not send another request.
5. `/__proof` showed exactly **one ready POST** and one retained UUID.
6. The route and fragment remained `/play?matchId=18318318-3183-4183-8183-183183183183#speed-gameplay`.
7. The mutation region retained `aria-live="polite"` and `aria-atomic="true"`.
8. Browser console: zero messages and zero JavaScript errors.
9. No horizontal overflow, obvious clipping/overlap, or opponent answer/hash/salt/word leakage was observed.

This is deterministic local production-artifact evidence, not hosted or durable-PostgreSQL evidence.

## Cleanup

- Temporary API fixture removed.
- Temporary API and Next processes stopped.
- Ports `3183` and `3184` confirmed closed.
- Final `git diff --check` passed.

## Risks and follow-up

- Ticket 188 should independently repeat the unsafe-retry, equal-time snapshot, lost-ready fallback, and unrelated-terminal-forfeit probes.
- Hosted QA should inspect durable operation rows while an original POST outlives browser/proxy uncertainty.
- The public Speed snapshot still cannot prove persisted forfeit operation absence; the implementation intentionally fails closed instead of exposing retry.
- No deployment, database operation, migration execution, configuration mutation, commit, PR, or merge was performed.
