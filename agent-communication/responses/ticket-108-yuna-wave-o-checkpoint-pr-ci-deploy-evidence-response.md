# Ticket 108 — Wave O Checkpoint PR/CI/Deploy Evidence Response

Agent: Athena on behalf of Yuna (devops checkpoint)
Status: Complete — hosted preview provisioned and verified after manual provider setup

## Hosted resources

- Web provider: Vercel Hobby/free
- Web project: `wordle-royale-web`
- Web URL: https://wordle-royale-web.vercel.app
- API provider: Railway
- Railway project: `lucid-dream`
- Railway service: `@wordle-royale/api`
- API URL: https://wordle-royaleapi-production.up.railway.app
- DB provider: Supabase Postgres
- DB project: `wordle-royale-preview-postgres`
- Redis: intentionally omitted; `REDIS_REQUIRED=false`

## Repo changes

Provider setup was dashboard/manual. No repo source change was required for provisioning itself.

Local ignored secret/reference file was maintained for Ashar:

- `.env.preview.local` — ignored by `.gitignore` via `.env.*`; not to be committed.

## Deploy evidence

API verification after final wiring:

```text
/healthz: ok
/readyz: ok,database=ok
/lobbies: 200
/leaderboard: 200
POST /auth/preview-demo/start: 201
redis: not_checked_stub (expected because Redis is optional/omitted)
```

Web verification:

```text
https://wordle-royale-web.vercel.app: 200
browser homepage: loaded
browser preview demo start: success
```

## Important fix applied

Initial independent hosted QA found 500s on preview demo/lobbies/leaderboard because the Supabase schema migration had not been applied.

After Ashar approved the DB operation, Athena ran:

```bash
pnpm --filter @wordle-royale/api db:migrate:deploy
```

Result:

```text
Applying migration `20260623000000_initial_schema`
All migrations have been successfully applied.
```

After migration, the hosted API/web smoke passed.

## Cost/free-tier notes

- No paid plans/custom domains/add-ons were intentionally enabled.
- Railway outbound IPv6 was enabled for DB compatibility.
- Supabase pooler URL is used for runtime DB connectivity.

## Rollback/delete notes

To disable preview safely:

1. In Vercel, pause/delete `wordle-royale-web`.
2. In Railway, stop/delete service `@wordle-royale/api` in project `lucid-dream`.
3. In Supabase, pause/delete project `wordle-royale-preview-postgres` if no longer needed.
4. Do not commit `.env.preview.local`.
