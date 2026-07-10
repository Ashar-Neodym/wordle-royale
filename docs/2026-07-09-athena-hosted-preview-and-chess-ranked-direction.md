# Athena checkpoint — Hosted preview live + chess-style ranked direction

Date: 2026-07-09
Agent: Athena

## Hosted preview status

Public preview services are live after manual provider setup:

- Web: https://wordle-royale-web.vercel.app
- API: https://wordle-royaleapi-production.up.railway.app
- DB: Supabase Postgres (`wordle-royale-preview-postgres`)
- Redis: omitted intentionally with `REDIS_REQUIRED=false`

Verification performed:

```text
web=200
api /healthz=ok
api /readyz=ok,database=ok
api /lobbies=200
api /leaderboard=200
api POST /auth/preview-demo/start=201
browser demo start redirected with status=success
```

Important fix applied during verification:

- Supabase schema migration had not been applied initially.
- Athena ran `pnpm --filter @wordle-royale/api db:migrate:deploy` against the approved preview Supabase DB after Ashar approved it.
- After migration, demo session, lobbies, and leaderboard endpoints passed.

## Product direction captured from Ashar

Wordle Royale should follow the structure of chess communities/products more closely:

- Ranked play should primarily mean real matchmaking against other players, not just static demo/rating screens.
- 1v1 ranked should feel like chess pairing: players queue, get matched, play the same puzzle/ruleset, and rating changes based on expected outcome.
- There should be separate formats similar to chess time controls.
- Lobbies should support ranked and unranked variants.
- Profiles should become richer, with a profile/avatar button and mode-specific rating/stat pages.
- Rating is central to identity, retention, matchmaking, and profile depth.

## Recommended rating model

Use chess-style structure, adapted for Wordle:

### Separate ratings by mode

Do not use one global rating across all modes. Maintain separate ratings for materially different queues:

- Ranked 1v1 Standard — primary competitive mode.
- Ranked 1v1 Speed/Blitz — time matters; separate ladder.
- Ranked 1v1 Classic — slower/less time-pressure mode.
- Ranked Multiplayer/Lobby — separate placement-based ladder.

Possible names can be refined later, but ratings should not be mixed between these categories.

### Scoring rules for 1v1

Recommended initial rules:

1. Both players receive the same puzzle.
2. Solver beats non-solver.
3. Fewer guesses beats more guesses.
4. Same guesses:
   - Standard/classic: draw.
   - Speed/blitz: faster solve wins.
5. Both fail:
   - Standard/classic: draw.
   - Speed/blitz: only use progress/time if the mode explicitly says so.
6. Disconnect after puzzle reveal should count as a loss or abandonment.
7. Disconnect before reveal should be no-contest unless abuse is detected.

### Rating algorithm

Prefer a Glicko-style internal model over plain Elo if feasible:

- User-facing rating remains a simple number.
- Internally store rating confidence/deviation and possibly volatility.
- New/inactive players can move faster and be matched more safely.

If implementation cost is too high, start with Elo + provisional/high-K behavior, but design the schema to allow Glicko-style fields later.

### Provisional phase

For each mode:

- First ~10 ranked games are provisional.
- Larger rating movement for provisional players.
- Capped effect on established opponents.
- UI label: `Provisional: X/10 games complete`.

### Matchmaking

Start narrow, expand over time:

```text
0s:   ±100 rating
10s:  ±200 rating
20s:  ±300 rating
30s+: wider match or offer alternate mode/lobby
```

Additional preferences:

- Prefer same mode/time-control.
- Prefer provisional vs provisional when possible.
- Avoid immediate repeat opponents.
- Keep speed modes more sensitive to latency/timing.

### Multiplayer/ranked lobbies

For ranked lobbies with more than two players, use a pairwise conversion MVP:

- 1st place beats every lower placement.
- 2nd loses to 1st but beats lower placements.
- Ties count as draws.
- Scale deltas by lobby size to avoid huge rating swings.
- Keep multiplayer rating separate from 1v1 ratings.

Unranked lobbies should exist for casual/social play and should not affect rating.

### Profile direction

Add a first-class profile/avatar entry point:

- Circular profile button in header.
- Profile page with mode tabs/cards: Standard, Speed/Blitz, Classic, Multiplayer.
- Rating number, provisional status, games played, W/L/D, streak, recent rating change.
- Rating history graph per mode.
- Match history and recent opponents.
- Public profile route remains shareable.

## Next wave recommendation

Before more UI polish, lock the ranked system architecture and data model:

1. Elisa: define rating/matchmaking/mode contracts.
2. Ruby: implement rating simulation/tooling for candidate formulas.
3. Freya: implement backend mode-aware rating profile foundation.
4. Luna: design profile/mode UI around the chess-style structure.
5. Jasmine: QA review rating rules and hosted preview after backend/UI slices.
