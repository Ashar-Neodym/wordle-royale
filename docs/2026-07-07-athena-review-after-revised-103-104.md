# Athena review after revised Tickets 103–104

Date: 2026-07-07
Owner: Athena
Scope: Verify revised Wave O provider decision/preflight after Ashar clarified long-term architecture and cost preferences.

## Result

Revised Tickets 103 and 104 are accepted.

## Locked direction

- Web: Vercel free account first; transfer/upgrade later only if product warrants it.
- API: separate long-running Node/Nest server; do not force the Nest API into Vercel serverless.
- Database: Supabase Postgres first.
- Database fallback: Neon only if Supabase fails documented fallback criteria.
- Redis: omitted initially with `REDIS_REQUIRED=false` and no `REDIS_URL`.
- Mobile: no public mobile deployment claim yet.
- Scope: no provisioning, deployment, provider login, real `.env`, secrets, paid resources, or provider resources yet.

## Architecture rationale

The product target is a large competitive/social ranked game, not a static demo. The backend should remain authoritative for ranked gameplay, lobbies, sessions, anti-cheat/spoiler-safe validation, and future realtime. Vercel is appropriate for the Next.js web frontend, but the API must stay provider-portable and capable of long-running server behavior.

## Verification

Read/checked:

- `agent-communication/responses/ticket-103-elisa-preview-provider-final-decision-response.md`
- `agent-communication/responses/ticket-104-yuna-preview-provisioning-preflight-response.md`
- `docs/2026-07-07-preview-provider-final-decision.md`
- `docs/2026-07-07-preview-provisioning-preflight.md`

Commands:

```bash
git diff --check
pnpm secret-scan
```

Result:

- `git diff --check`: pass
- `pnpm secret-scan`: pass; 190 source/config files scanned

## Remaining gate

Ticket 105 is still blocked until Ashar explicitly approves provider/resource/secret creation.
