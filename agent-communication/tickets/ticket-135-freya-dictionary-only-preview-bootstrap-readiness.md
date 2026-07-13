# Ticket 135 — Dictionary-Only Preview Bootstrap and Operational Readiness

Agent: Freya (backend implementation)
Wave: R-Hosted-Fix
Status: Blocked on Ticket 134

## Goal

Implement the approved preview-only dictionary bootstrap and prevent readiness from overstating Standard matchmaking availability.

## Requirements

1. Refactor dictionary fixture planning so dictionary-only application does not create users/profiles/ratings.
2. Add a clearly named idempotent command such as `db:bootstrap:preview-dictionary`.
3. Enforce Ticket 134 environment and explicit-confirmation guards before apply; fail closed outside approved preview context.
4. Preserve `fixtureOnly=true`, `productionApproved=false`, validation metadata, deterministic IDs/checksum, and idempotent upserts.
5. Make matchmaker dictionary selection follow the preview/production policy.
6. Extend `/readyz` or its dependency details to report usable dictionary availability for the live Standard queue.
7. Normalize sequential and concurrent missing-dictionary attempts to the same safe `503`, eliminating the unexplained generic `500`.
8. Add fresh-schema integration coverage:
   - migrations only -> readiness unavailable for Standard dictionary and queue returns safe 503;
   - dictionary-only bootstrap -> readiness ok and two users create exactly one shared match;
   - second bootstrap -> no duplicates and unchanged deterministic counts;
   - no fixture users/profiles created by dictionary bootstrap.
9. Document exact local verification and hosted execution/rollback commands without secrets.

## Verification

```bash
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm build
CI=true pnpm smoke:api:prod-start
CI=true pnpm smoke:local
CI=true pnpm secret-scan
git diff --check
```

Also run the new real-PostgreSQL fresh-schema bootstrap/matchmaking integration.

## Safety

Do not connect to or mutate hosted Supabase/Railway/Vercel. Return implementation and evidence only.
