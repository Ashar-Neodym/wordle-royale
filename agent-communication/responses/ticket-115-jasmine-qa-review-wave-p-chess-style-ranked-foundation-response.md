# Ticket 115 — QA Review Wave P Chess-Style Ranked Foundation — Response

Task: Ticket 115 — QA Review Wave P Chess-Style Ranked Foundation
Agent: Jasmine (QA)
Verdict: CONDITIONAL PASS

## Summary

Wave P passes the required local gate chain and the hosted preview remains stable for the ticket's required smoke surfaces. The current working tree reflects the chess-style ranked direction through mode-aware contract constants, Prisma rating profile modes, rating-tool mode ladder simulations, leaderboard/profile read models, and UI copy that generally distinguishes live Standard behavior from prepared future modes.

I did not find a critical blocker that should stop the Wave P foundation from continuing, but I found two UI/product-accuracy issues Luna should address before treating the profile mode cards as production-polished: non-live mode cards show hard-coded plausible rating numbers, and the Standard mode card derives W/L/D from match outcome labels instead of the backend rating profile counters.

## Acceptance criteria checked

| Criterion | Result | Evidence |
|---|---:|---|
| Chess-style ranked direction is reflected accurately: separate mode ratings, matchmaking queues, ranked/unranked lobbies, profile stats | Conditional pass | Contracts define `rankedModes`; Prisma has `RatingProfile.mode`; rating tools define four `MODE_LADDERS`; read models expose mode-aware leaderboard/profile ratings; UI shows mode selection/lobby/profile affordances. Caveats below for profile card stats and placeholder ratings. |
| No UI claims live matchmaking/rating features before backend support exists | Conditional pass | Play/lobby/profile copy repeatedly says only Standard/lobby-backed path is live and labels other modes as prepared/UI-only. Caveat: prepared mode cards still display hard-coded rating-like values, which can look like real data despite warning copy. |
| Hosted preview web root 200 | Pass | `curl https://wordle-royale-web.vercel.app/` returned `200`; browser root rendered. |
| Hosted preview API `/healthz` | Pass | `curl https://wordle-royaleapi-production.up.railway.app/healthz` returned `200`, data status `ok`. |
| Hosted preview API `/readyz` | Pass | `curl https://wordle-royaleapi-production.up.railway.app/readyz` returned `200`, data status `ok`, database `ok`, Redis optional/not checked. |
| Hosted preview demo start | Pass | `POST /auth/preview-demo/start` returned `201`; subsequent `GET /auth/me` with cookie returned `200`. |
| Hosted lobbies/leaderboard/profile pages | Pass | Web `/lobbies`, `/leaderboard`, `/profile`, `/play`, `/server`, `/` all returned `200`. Browser `/lobbies`, `/leaderboard`, `/profile` rendered without console errors observed. |
| Migrations/readiness follow-up handled or explicitly tracked | Pass with residual risk | Ticket 114 produced `docs/2026-07-09-hosted-preview-migration-readiness-hardening.md` with Railway pre-deploy/manual migration policy and `/readyz` schema-readiness follow-up criteria. It explicitly says no provider changes/readiness code changes were performed yet. |
| Identify blockers vs warnings | Pass | Findings are separated below. |

## Commands run + exit codes

### Required ticket gate chain

```bash
CI=true pnpm lint && \
CI=true pnpm typecheck && \
CI=true pnpm test && \
CI=true pnpm build && \
CI=true pnpm smoke:local && \
CI=true pnpm secret-scan && \
git diff --check
```

Exit code: `0`

Observed highlights:

```text
Workspace scaffold validation passed (9 workspace packages).
apps/web build: ✓ Compiled successfully
apps/api build: Done
Local smoke passed. This smoke test validates local config only; it does not start app services.
Secret scan passed (192 source/config files scanned).
```

### Targeted API/rating/schema checks

```bash
CI=true pnpm --filter @wordle-royale/api test && \
CI=true pnpm --filter @wordle-royale/rating-tools test && \
CI=true pnpm --filter @wordle-royale/api db:validate
```

Exit code: `0`

Observed highlights:

```text
api: tests 48, pass 48, fail 0
rating-tools: tests 14, pass 14, fail 0
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

### Hosted preview smoke

```bash
WEB=https://wordle-royale-web.vercel.app
API=https://wordle-royaleapi-production.up.railway.app
COOKIE_JAR=$(mktemp)

curl -fsS -o /tmp/wr_web_root.html -w '%{http_code}\n' "$WEB/"
curl -fsS -o /tmp/wr_healthz.json -w '%{http_code}\n' "$API/healthz"
curl -fsS -o /tmp/wr_readyz.json -w '%{http_code}\n' "$API/readyz"
curl -fsS -o /tmp/wr_lobbies.json -w '%{http_code}\n' "$API/lobbies"
curl -fsS -o /tmp/wr_leaderboard.json -w '%{http_code}\n' "$API/leaderboard"
curl -fsS -o /tmp/wr_demo_start.json -w '%{http_code}\n' -c "$COOKIE_JAR" -H "Origin: $WEB" -X POST "$API/auth/preview-demo/start"
curl -fsS -o /tmp/wr_auth_me.json -w '%{http_code}\n' -b "$COOKIE_JAR" -H "Origin: $WEB" "$API/auth/me"
```

Exit code: one wrapper script returned `1` only because a non-required guessed profile API handle returned `404` and the follow-up JSON reader expected that file. The required smoke endpoints before/after that passed:

```text
WEB root: 200
API healthz: 200
API readyz: 200
API lobbies: 200
API leaderboard: 200
Preview demo start: 201
Auth me with cookie: 200
readyz status=ok deps={'database': {'status': 'ok', ...}, 'redis': {'status': 'not_checked_stub', ...}}
```

Additional page-level HTTP smoke:

```bash
for path in / /lobbies /leaderboard /profile /play /server; do
  curl -fsS -o /tmp/wr_page_${path//\//_}.html -w '%{http_code} %{size_download}\n' "$WEB$path"
done
```

Exit code: `0`

```text
/             200 73003
/lobbies      200 79788
/leaderboard  200 72064
/profile      200 77307
/play         200 104313
/server       200 71075
```

### Current deployed feature endpoint observation

```bash
curl -fsS https://wordle-royaleapi-production.up.railway.app/ranked/modes | python3 -m json.tool | head -120
```

Exit code: `1`

```text
curl: (22) The requested URL returned error: 404
```

This is not a blocker for Ticket 115's required hosted smoke list, but it means the hosted API does not currently expose the new `/ranked/modes` controller route from the working tree. Do not use hosted `/ranked/modes` as evidence that Wave P backend code is deployed.

## Browser / visual evidence

Browser smoke targets:

- `https://wordle-royale-web.vercel.app/`
  - Root rendered primary nav, preview limitations banner, hero, Start preview demo affordance, and server/rating status region.
- `https://wordle-royale-web.vercel.app/lobbies`
  - Rendered live API state (`LOCAL API ROUTE`), `0 open room(s)`, explicit preview-demo gating, disabled write buttons before session, and server status `database: ok · redis: not_checked_stub`.
- `https://wordle-royale-web.vercel.app/leaderboard`
  - Rendered leaderboard page and play-for-rating links.
- `https://wordle-royale-web.vercel.app/profile`
  - Rendered profile page as unavailable/empty rather than faking current-player data without a session.

Browser console check on root found no console messages or JS errors at the time checked.

## Findings

### Blockers

None found for the ticket's required local gate chain and hosted preview stability checks.

### Warnings / required follow-up before polished release

#### 1. Prepared mode cards display hard-coded rating-looking values

Owner: Luna

File inspected:

- `apps/web/src/components/ProfileHistory.tsx`

Evidence:

```ts
const rating = 1500 - index * 25;
...
rating,
gamesPlayed: 0,
wins: 0,
losses: 0,
draws: 0,
recentDelta: null,
graph: [rating, rating, rating],
```

The cards are labeled `UI prepared` and include warning text, which prevents this from being a hard blocker. However, showing `1475`, `1450`, and `1425` for non-live modes can still read as real per-mode ratings. This is risky against the acceptance goal that UI must not claim live rating features before backend support exists.

Recommended fix: for non-live modes, render `Not live`, `Prepared`, or default `1500` explicitly as a placeholder, and avoid fake sparkline/rating values unless the API read model supplies real mode data.

#### 2. Standard mode card W/L/D is derived from recent match outcome labels instead of backend rating counters

Owner: Luna

File inspected:

- `apps/web/src/components/ProfileHistory.tsx`

Evidence:

```ts
const wins = recent.filter((match) => /won|win/i.test(match.viewer?.outcome ?? '')).length;
const losses = recent.filter((match) => /lost|loss|abandon/i.test(match.viewer?.outcome ?? '')).length;
const draws = recent.filter((match) => /draw/i.test(match.viewer?.outcome ?? '')).length;
```

The contracts and backend profile summary already carry `wins`, `losses`, `draws`, and `abandons` on `profile.rating`. Match history viewer outcomes are schema values like `solved`, `failed`, `abandoned`, and `voided`, so the regex above will usually undercount wins/losses/draws. This makes profile stats less accurate even when the backend read model is correct.

Recommended fix: use `profile.rating.wins`, `profile.rating.losses`, `profile.rating.draws`, and optionally `profile.rating.abandons` for the live Standard card. If recent-form stats are desired, label them separately and compute from placement/rating delta rather than outcome text.

### Non-blocking observations

- Hosted guessed profile rating endpoints like `/profiles/alice/rating` returned `404`; this is acceptable because the ticket asks for hosted profile pages, and `/profile` page returned `200` with honest unavailable/empty-state UI.
- Hosted `/ranked/modes` returned `404`, while the current working tree includes `@Get('ranked/modes')`. This suggests hosted API is not currently deployed with that Wave P route. It does not break required preview surfaces, but release notes should avoid implying that endpoint is live in hosted preview until redeployed and smoked.
- The readiness hardening/migration policy is documented, not implemented. This matches Ticket 114's stated scope, but it remains a release/deploy residual risk until Railway pre-deploy migration configuration and schema-aware `/readyz` are actually implemented.
- `git status --short --ignored` shows ignored local `.env.preview.local`. I did not inspect its contents. It is not tracked; keep it that way.

## Regression / security / scope review notes

- Secret scan passed for tracked source/config files.
- `git diff --check` passed.
- Prisma schema validates.
- Required migrations are present locally at `apps/api/prisma/migrations/20260709000000_mode_aware_rating_profiles/migration.sql` and add mode-aware rating profile fields/indexes.
- No destructive provider/deployment actions were performed.
- Browser profile/lobbies views avoid silent fixture-user impersonation in hosted preview.
- Current hosted `/readyz` proves dependency connectivity, not application schema readiness. Ticket 114 tracks this explicitly.

## Required fixes / owner

No merge-stopping blocker from Jasmine for the Wave P foundation if Athena accepts the residual hosted deployment and UI-placeholder risks.

Before product-polished release or public messaging that per-mode profile stats are live:

1. Luna: replace fake non-live mode rating values/sparklines with unmistakable placeholder UI.
2. Luna: use backend profile rating counters for Standard W/L/D/abandon stats instead of parsing recent match outcome strings.
3. Freya/Yuna: implement or schedule the schema-aware `/readyz` follow-up and Railway pre-deploy migration policy from Ticket 114 before relying on hosted preview deploys as safe.

## Residual risks

- Hosted preview can remain healthy while a newly added working-tree route is absent until API redeploy occurs, as observed with `/ranked/modes=404`.
- `/readyz` still does not prove required application tables exist; schema-backed smoke must remain part of deployment QA.
- Mobile remains outside this ticket's smoke scope.
- No real matchmaking queue was verified; current UI honestly frames queues/modes as prepared or future-facing where backend support is not complete.

## Files changed

Created:

- `agent-communication/responses/ticket-115-jasmine-qa-review-wave-p-chess-style-ranked-foundation-response.md`

No product source files were modified by Jasmine.
