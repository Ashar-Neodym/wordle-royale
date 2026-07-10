# Ticket 109 — QA Review Wave O Hosted Preview Response

Agent: Jasmine-equivalent independent QA, finalized by Athena after fix verification
Status: PASS WITH WARNINGS

## Scope verified

- Hosted web URL is live.
- Hosted API health/readiness are live.
- Supabase database connectivity is live.
- Redis omission behaves as expected.
- Preview demo session can start after migration fix.
- Basic web homepage smoke passes.

## Evidence

```text
web=200
api /healthz=ok
api /readyz=ok,database=ok
api /lobbies=200
api /leaderboard=200
api POST /auth/preview-demo/start=201
browser demo start redirected with status=success
```

## Initial blocker found and resolved

Initial independent QA found:

```text
POST /auth/preview-demo/start: 500
GET /lobbies: 500
GET /leaderboard: 500
```

Root cause:

- Supabase schema migration had not been applied.
- `/readyz` only confirmed database connectivity, not that application tables were migrated.

Fix:

```bash
pnpm --filter @wordle-royale/api db:migrate:deploy
```

Result:

```text
20260623000000_initial_schema applied
```

Recheck passed.

## Warnings / follow-ups

- Add a Railway pre-deploy migration step or documented release checklist so future deploys do not miss migrations.
- `/readyz` should eventually check required application schema/table availability, not only basic DB connectivity.
- Preview still uses demo sessions only; no durable accounts yet.
- Mobile physical-device smoke remains separate/deferred.
- Redis is omitted by design and should remain optional until explicitly needed.

## Recommendation

Hosted controlled preview can proceed for internal/share-with-care use after noting the warnings above.
