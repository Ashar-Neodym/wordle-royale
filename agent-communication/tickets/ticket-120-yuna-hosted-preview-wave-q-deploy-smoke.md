# Ticket 120 — Hosted Preview Wave Q Deploy and Smoke

Agent: Yuna (devops/deploy)
Wave: Q — Wave P QA follow-up and deploy hardening
Status: New after Ticket 119 PR/CI and merge approval

## Context

Hosted preview currently runs Wave O code; Jasmine observed `/ranked/modes` is 404 on hosted API because Wave P code is not deployed yet. After Wave Q PR is approved/merged, deploy the updated API/web preview and apply migrations safely.

## Task

Deploy Wave Q to hosted preview and smoke the updated public preview.

## Scope

- Requires explicit Ashar approval before merge/deploy if provider changes or branch merge are needed.
- Ensure Prisma migrations apply to Supabase preview DB.
- Confirm hosted API exposes new Wave P/Q backend surfaces, especially `/ranked/modes` if implemented.
- Confirm Vercel web reflects Wave Q UI fixes.
- Record only non-secret provider evidence.

## Hosted smoke checklist

```text
web /: 200
web /play: 200
web /profile: 200
api /healthz: 200 ok
api /readyz: 200 ok with database ok and app schema ok/migration-ready signal if implemented
api /lobbies: 200
api /leaderboard: 200
api /ranked/modes: 200 if route is included in merged API
POST /auth/preview-demo/start: 201
GET /auth/me with cookie: 200
```

## Acceptance criteria

- Migration evidence recorded without secrets.
- Hosted API/web URLs recorded.
- Hosted smoke passes or blockers are specific and routed.
- Rollback instructions included.

## Output

Write response to:

`agent-communication/responses/ticket-120-yuna-hosted-preview-wave-q-deploy-smoke-response.md`
