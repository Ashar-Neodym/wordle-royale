# Athena Wave O Architecture Direction

Date: 2026-07-07
Owner: Athena
Scope: Resolve Wave O hosting direction after Ashar clarified long-term product/cost preferences.

## Decision

Use a stable split architecture:

- Web frontend: Vercel
- API/server: long-running Node/Nest service, not Vercel serverless for the current app
- Database: Supabase Postgres for preview, using Ashar's free account first
- Redis: omit initially with `REDIS_REQUIRED=false`; add later only when a product feature truly needs it
- Mobile: no public mobile deployment yet; Expo Go/manual smoke only

## Why this is the right shape for the end product

Wordle Royale is intended to become a large, competitive, social product. It needs an authoritative backend/server for:

- ranked match state and server-side scoring authority;
- anti-cheat/spoiler-safe validation;
- matchmaking/lobbies;
- private DB access and migrations;
- secure cookies/session handling;
- future realtime/WebSocket behavior;
- provider-independent API contracts for web and mobile clients.

The server should remain a separate API service. Vercel is still the right place for the Next.js web app, but the current Nest API should not be forced into Vercel serverless just to reduce hosting surfaces. That would be a risky architecture change and likely create future realtime/runtime constraints.

## Provider direction

### Web: Vercel

Use Ashar's free Vercel account for the preview. If the product becomes strong enough, ownership can later move to a Vercel Pro/team account without changing the app architecture.

### Database: Supabase Postgres

Prefer Supabase Postgres for preview because Ashar already has access/subscription context. This is still standard Postgres, so it does not lock the architecture to Supabase-specific app services. Use Supabase only as the managed Postgres provider for now.

Neon remains an acceptable fallback, but it is not the preferred first choice after Ashar's clarification.

### API/server: long-running Node host

The current app is a Nest API with production start shape. It needs a long-running Node hosting target such as Render/Fly/Railway or equivalent. For preview, choose the cheapest/free option available after Yuna verifies current limits. Render remains acceptable for a first controlled preview, but Yuna should compare it against any already-available free/cheap host before provisioning.

Do not move the API into Vercel serverless as part of Wave O.

### Redis

Omit initially. Keep:

```text
REDIS_REQUIRED=false
REDIS_URL unset
```

Add Redis later only when realtime/rate-limit/queue/session durability requirements justify it.

## Scope correction for Tickets 103/104

Tickets 103 and 104 should be revised before Ticket 105:

- Replace Neon-first language with Supabase Postgres first, Neon as fallback.
- Keep Vercel web.
- Keep a separate long-running API/server host.
- Confirm exact API host provider through Yuna preflight before provisioning.
- Do not provision resources until Ashar explicitly approves.

## Approval boundary

Ticket 105 must remain blocked until Ashar approves the exact provider set and resource/secret creation.

Suggested future approval shape:

```text
I approve Wave O provisioning for Wordle Royale preview using Vercel web, Supabase Postgres, a separate long-running Node API host selected from the free/cheap option verified by Yuna, and no Redis initially (`REDIS_REQUIRED=false`). Use free/cheap settings only, store secrets only in provider env stores, and do not add paid plans/custom domains without asking me again.
```
