# Ticket 83 — Ranked Loop Rematch / Share / Result Actions

Task: Add backend/contract support for post-ranked-match result actions: rematch affordance, spoiler-safe share summary, profile/history links, and next-ranked-game CTA data.

Agent: Ruby (backend)

Status: Done

## Summary

Implemented a spoiler-safe `resultActions` payload on completed ranked match results.

Completed result summaries from `GET /matches/:matchId/result` now include:

- `resultActions.rematch`
  - Present in the contract now.
  - Honest disabled state for this slice: `available: false`, `reason: not_implemented`, `label: Create rematch lobby`.
  - This avoids pretending a full same-settings rematch lobby service exists before backend support is built.
- `resultActions.share`
  - `spoilerSafe: true` enforced by contract.
  - Short share text derived only from placements and total scores.
  - Stable match path: `/matches/:matchId`.
- `resultActions.links`
  - `matchHref`
  - `historyHref`
  - `leaderboardHref`
  - `nextRankedHref`
  - `profileHrefTemplate`

Active match state intentionally does **not** include `resultActions`.

## Files changed

- `packages/contracts/src/gameplay/schemas.ts`
  - Added `rankedMatchResultActionSchema`.
  - Required `resultActions` on `rankedMatchResultSummarySchema`.
- `packages/contracts/src/common/contracts.test.ts`
  - Replaced the basic result-summary contract test with a spoiler-safe post-match-action contract test.
- `apps/api/src/gameplay/gameplay-persistence.service.ts`
  - Added `buildResultActions(...)`.
  - Included `resultActions` in finalized ranked match result summaries.
- `apps/api/test/gameplay-controller.test.ts`
  - Added REST assertions for result-action shape and spoiler-safety.
  - Added active-state regression assertion that `resultActions` is absent while a match is incomplete.
  - Updated the dev-helper environment guard test to set both `NODE_ENV=production` and `APP_ENV=production`, matching the current auth boundary service.
- `apps/api/src/gameplay/gameplay.controller.ts`
  - Completed the existing current-user-service integration so gameplay routes compile and resolve fixture users through `CurrentUserService` consistently.
- `apps/api/README.md`
  - Documented completed-result `resultActions` semantics and spoiler boundaries.

## API / data contract impact

### Changed

`GET /matches/:matchId/result` completed result payload now includes:

```ts
resultActions: {
  rematch: {
    available: false;
    reason?: 'not_implemented' | 'match_not_completed' | 'unsupported_match_type' | null;
    label: string;
  };
  share: {
    spoilerSafe: true;
    text: string;
    path: `/matches/${matchId}`;
  };
  links: {
    matchHref: `/matches/${matchId}`;
    historyHref: '/history';
    leaderboardHref: '/leaderboard';
    nextRankedHref: '/lobbies?mode=ranked&status=waiting';
    profileHrefTemplate: '/profile/{handle}';
  };
}
```

### Not changed

- No Prisma schema migration.
- No new public endpoint.
- No live rematch lobby creation yet.
- No external services or paid dependencies.
- No secret/env changes.
- Active match snapshots remain spoiler-safe and do not include post-match result actions.

## Verification

### RED phase

- `pnpm --filter @wordle-royale/contracts test` — exit `1`
  - Failed before schema implementation because `resultActions` was stripped/undefined.
- `pnpm --filter @wordle-royale/api test -- test/gameplay-controller.test.ts` — exit `1`
  - Failed before service implementation because REST result payload lacked `resultActions`.

### Final commands

- `pnpm --filter @wordle-royale/api test` — exit `0`
  - `37/37` passed.
- `pnpm --filter @wordle-royale/api build` — exit `0`
  - `tsc --noEmit -p tsconfig.json` passed.
- `pnpm --filter @wordle-royale/contracts test` — exit `0`
  - `18/18` passed.
- `pnpm build` — exit `0`
  - Root workspace build passed, including API, web, mobile, contracts, fixtures, game-engine, rating-tools, word-tools, and design-tokens.
- `pnpm --filter @wordle-royale/api db:validate` — exit `0`
  - Prisma schema valid.
- `pnpm validate:workspace` — exit `0`
  - `Workspace scaffold validation passed (9 workspace packages).`
- `pnpm secret-scan` — exit `0`
  - `Secret scan passed (185 source/config files scanned).`

## Security / data risks

- Low risk.
- Payload is derived from match id + final standings only.
- Contract enforces `share.spoilerSafe: true`.
- Tests assert result actions do not contain answer/hash/salt markers.
- Active match-state endpoint remains without `resultActions`.
- No production data operation, schema migration, or secret change.

## Follow-ups

- Build a real rematch-lobby creation backend slice when product is ready to support same-settings rematch creation.
- Once profile handles are consistently available in result summaries, Luna/Freya can convert `profileHrefTemplate` into concrete per-participant profile links client-side.
