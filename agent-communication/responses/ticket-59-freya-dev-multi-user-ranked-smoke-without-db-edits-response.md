# Ticket 59 — Dev Multi-User Ranked Smoke Without DB Edits Response

## Summary

Ticket 59 is complete.

I added a local/dev/test-only multi-user ranked smoke path so the local E2E loop no longer needs direct DB edits to terminalize the second participant:

- `x-wordle-dev-user-id` can select one of the two local fixture users for `GET /matches/:matchId/state` and `POST /matches/:matchId/rounds/:roundId/guesses`.
- `POST /matches/dev/:matchId/users/:userId/terminalize` can terminalize either fixture participant during local/dev/test smoke.
- Both paths reject outside `NODE_ENV !== 'production'`; the terminalization route returns `403 dev_helper_disabled` in production mode.
- API tests now cover the guard behavior and the dev-helper multi-user completion path.

I also fixed the seed dry-run test expectation so it matches the current Ticket 58-era fixture user count while still asserting the smoke stub users are included and spoiler-safe.

## Decisions / Recommendations

1. **Chose a guarded dev helper rather than changing auth.**
   - True multi-account auth is still future product work.
   - For Wave I local smoke, a narrow helper is safer and faster: only known fixture UUIDs are accepted, and it is disabled in production mode.

2. **Kept the helper route explicit and visibly non-product.**
   - Route: `POST /matches/dev/:matchId/users/:userId/terminalize`
   - Body: `{ "outcome": "solved" | "failed" | "abandoned" | "voided", "finalScore": number }`
   - Invalid/non-terminal outcomes reject with `invalid_terminal_outcome`.

3. **Kept result/rating finalization server-authoritative.**
   - The helper only moves participants to terminal outcomes for local smoke.
   - Rating is still applied through `POST /matches/:matchId/complete`.
   - Repeated completion remains idempotent.

4. **No production secret or DB-edit path added.**
   - The live smoke used only HTTP endpoints after the normal local DB reset/seed setup.
   - No direct `UPDATE` statements were used to complete participants.

## Detailed Output

### New local/dev user selection

`GET /matches/:matchId/state` and `POST /matches/:matchId/rounds/:roundId/guesses` now accept:

```text
x-wordle-dev-user-id: 11111111-1111-4111-8111-111111111111
x-wordle-dev-user-id: 22222222-2222-4222-8222-222222222222
```

Behavior:

- no header keeps the existing default stub host user;
- known fixture user IDs are accepted only when `NODE_ENV !== 'production'`;
- unknown IDs reject with `unknown_dev_fixture_user`;
- production mode rejects fixture switching with `dev_helper_disabled`.

### New local/dev terminalization route

```http
POST /matches/dev/:matchId/users/:userId/terminalize
```

Example body:

```json
{
  "outcome": "failed",
  "finalScore": 120
}
```

Behavior:

- accepts only fixture host/guest UUIDs;
- accepts only terminal outcomes: `solved`, `failed`, `abandoned`, `voided`;
- updates the participant outcome/final score;
- marks the active round completed once all participants are terminal;
- returns the selected user's current match snapshot;
- rejects in production mode with `403 dev_helper_disabled`.

### Multi-user ranked HTTP smoke path exercised

Live API sequence exercised against local Postgres/Redis:

1. `GET /readyz`
2. `POST /lobbies`
3. `POST /lobbies/:lobbyId/join`
4. `POST /matches/ranked/start`
5. `POST /matches/:matchId/rounds/:roundId/guesses` as host fixture user
6. `GET /matches/:matchId/state` as guest fixture user
7. `POST /matches/dev/:matchId/users/:hostUserId/terminalize`
8. `POST /matches/dev/:matchId/users/:guestUserId/terminalize`
9. `POST /matches/:matchId/complete`
10. repeat `POST /matches/:matchId/complete`
11. `GET /matches/:matchId/result`
12. `GET /leaderboard?limit=5`

Result: all smoke steps passed without direct DB edits.

## Exact Smoke Commands

Working directory:

```bash
cd /home/ashar/Desktop/hermes-projects/wordle-royale
```

Start local dependencies and reset/seed the local ranked smoke DB:

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm deps:up
DATABASE_URL='postgresql://wordle:wordle_local_password@localhost:5432/wordle_royale_local?schema=public' \
  pnpm --filter @wordle-royale/api exec prisma db push --schema prisma/schema.prisma --force-reset --accept-data-loss --skip-generate
DATABASE_URL='postgresql://wordle:wordle_local_password@localhost:5432/wordle_royale_local?schema=public' \
  pnpm --filter @wordle-royale/api db:seed:local
```

Start the API:

```bash
PORT=3059 \
DATABASE_URL='<local-postgres-url>' \
REDIS_URL='<local-redis-url>' \
pnpm --filter @wordle-royale/api dev
```

Run the smoke from another shell:

```bash
node --input-type=module <<'NODE'
const base='http://127.0.0.1:3059';
async function call(method,path,body,headers={}){const res=await fetch(`${base}${path}`,{method,headers:{'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});const json=await res.json().catch(()=>({}));return{status:res.status,json};}
function id(){return crypto.randomUUID();}
async function createLobby(){for(let attempt=1;attempt<=5;attempt++){const response=await call('POST','/lobbies',{clientRequestId:id(),visibility:'public',rated:true,mode:'standard',language:'en',wordLength:5,difficulty:'medium',minPlayers:2,maxPlayers:4,roundsCount:3,roundTimeSeconds:120,scoringPreset:'standard_v1'});if(response.status<500)return response;}return call('POST','/lobbies',{clientRequestId:id(),visibility:'public',rated:true,mode:'standard',language:'en',wordLength:5,difficulty:'medium',minPlayers:2,maxPlayers:4,roundsCount:3,roundTimeSeconds:120,scoringPreset:'standard_v1'});}
const hostUserId='11111111-1111-4111-8111-111111111111';
const guestUserId='22222222-2222-4222-8222-222222222222';
const ready=await call('GET','/readyz');
const create=await createLobby();
const lobbyId=create.json.data?.id;
const lobbyCode=create.json.data?.code;
const join=await call('POST',`/lobbies/${lobbyId}/join`,{clientRequestId:id()});
const start=await call('POST','/matches/ranked/start',{clientRequestId:id(),lobbyId,source:'lobby'});
const matchId=start.json.data?.matchId;
const roundId=start.json.data?.roundId;
const hostGuess=await call('POST',`/matches/${matchId}/rounds/${roundId}/guesses`,{clientRequestId:id(),matchId,roundId,guess:'crane'},{'x-wordle-dev-user-id':hostUserId});
const guestState=await call('GET',`/matches/${matchId}/state`,undefined,{'x-wordle-dev-user-id':guestUserId});
const terminalizeHost=await call('POST',`/matches/dev/${matchId}/users/${hostUserId}/terminalize`,{outcome:'solved',finalScore:960});
const terminalizeGuest=await call('POST',`/matches/dev/${matchId}/users/${guestUserId}/terminalize`,{outcome:'failed',finalScore:120});
const complete=await call('POST',`/matches/${matchId}/complete`,{clientRequestId:id(),matchId,reason:'all_players_final'});
const repeatComplete=await call('POST',`/matches/${matchId}/complete`,{clientRequestId:id(),matchId,reason:'all_players_final'});
const result=await call('GET',`/matches/${matchId}/result`);
const leaderboard=await call('GET','/leaderboard?limit=5');
const serialized=JSON.stringify({start,hostGuess,guestState,terminalizeHost,terminalizeGuest,complete,result,leaderboard});
const leaks=['answerWordHash','answerWordSaltRef','normalizedWord','answerWord'].filter(n=>serialized.includes(n));
const summary={ready:ready.status,lobbyStatus:create.status,joinStatus:join.status,startStatus:start.status,hostGuessStatus:hostGuess.status,hostGuessAccepted:hostGuess.json.data?.accepted,guestStateStatus:guestState.status,guestPlayerRoundStateBeforeHelper:guestState.json.data?.myState?.playerRoundState,terminalizeHostStatus:terminalizeHost.status,terminalizeHostState:terminalizeHost.json.data?.myState?.playerRoundState,terminalizeGuestStatus:terminalizeGuest.status,terminalizeGuestState:terminalizeGuest.json.data?.myState?.playerRoundState,completeStatus:complete.status,repeatCompleteStatus:repeatComplete.status,resultStatus:result.status,leaderboardStatus:leaderboard.status,leaderboardEntries:leaderboard.json.data?.entries?.length,matchId,roundId,lobbyCode,ratingDeltas:complete.json.data?.ratingEvent?.participants?.map(p=>p.ratingDelta),leaks};
console.log(JSON.stringify(summary,null,2));
if([ready,create,join,start,hostGuess,guestState,terminalizeHost,terminalizeGuest,complete,repeatComplete,result,leaderboard].some(e=>e.status>=400)||leaks.length) process.exitCode=1;
NODE
```

## Open Questions

None blocking Ticket 59.

Non-blocking: true multi-user auth remains future product work; this ticket intentionally adds only a local/dev/test fixture helper for repeatable smoke.

## Follow-up Tickets

1. Fold the above smoke into the next ranked E2E demo script/documentation ticket so agents do not need to paste the inline Node script.
2. Consider surfacing a safer named npm script for the API HTTP smoke once Wave I stabilizes the exact demo path.
3. Continue with Ticket 60 natural terminalization so the helper can eventually be used less often or removed.

## Files Changed

- `apps/api/src/gameplay/gameplay.controller.ts`
- `apps/api/src/gameplay/gameplay-persistence.service.ts`
- `apps/api/test/gameplay-controller.test.ts`
- `apps/api/prisma/seed-fixtures.test.mjs`
- `agent-communication/responses/ticket-59-freya-dev-multi-user-ranked-smoke-without-db-edits-response.md`

## Tests / Commands Run

- `pnpm --filter @wordle-royale/api test` — first run exit `1`; new gameplay tests passed, but existing seed dry-run summary test expected `users.count === 4` while current fixture plan returns `6`. I updated that test to match the current fixture plan and assert `player_one`/`guest_player` are included.
- `pnpm --filter @wordle-royale/api test` — exit `0`; 31/31 tests passed.
- `pnpm --filter @wordle-royale/api build` — exit `0`; `tsc --noEmit -p tsconfig.json` passed.
- `pnpm --filter @wordle-royale/api db:validate` — exit `0`; Prisma schema valid.
- `pnpm deps:check` — exit `0`; Docker Compose config passed.
- `pnpm secret-scan` — exit `0`; 167 source/config files scanned.
- `pnpm deps:up && pnpm ranked:smoke:reset` — exit `0` on the first live-smoke setup attempt; local schema reset and fixture seed completed.
- Later rerun of `pnpm ranked:smoke:reset` without the Yuna `DOCKER_CONFIG` exposed an environment-sensitive Docker Compose wrapper failure (`unknown shorthand flag: 'T' in -T`). With `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker`, a subsequent reset attempt hit a transient Prisma `P1014` after schema drop. I recovered with the explicit `prisma db push --force-reset` + `db:seed:local` commands documented above.
- Live HTTP smoke on API port `3059` — exit `0`; create/join/start/guess/state/terminalize/complete/result/leaderboard all passed without direct DB edits.

## Evidence / Result

### API test evidence

```text
▶ ranked gameplay REST endpoints
  ✔ starts a lobby-backed ranked match and returns a spoiler-safe success envelope
  ✔ rejects route/body match mismatch with the shared error envelope
  ✔ submits guesses through server-authoritative scoring and exposes only my safe state
  ✔ rejects result and rating finalization while a ranked match is still active/incomplete
  ✔ exposes guest fixture state through the local dev user switch header
  ✔ rejects dev helper use outside local/dev/test mode
  ✔ completes terminal matches, returns rating deltas, and remains idempotent
  ✔ allows explicit void completion without applying rating rows
✔ ranked gameplay REST endpoints
ℹ tests 31
ℹ pass 31
ℹ fail 0
```

### Live smoke evidence

```json
{
  "ready": 200,
  "lobbyStatus": 201,
  "joinStatus": 201,
  "startStatus": 201,
  "hostGuessStatus": 201,
  "hostGuessAccepted": true,
  "guestStateStatus": 200,
  "guestPlayerRoundStateBeforeHelper": "active",
  "terminalizeHostStatus": 201,
  "terminalizeHostState": "solved",
  "terminalizeGuestStatus": 201,
  "terminalizeGuestState": "failed",
  "completeStatus": 201,
  "repeatCompleteStatus": 201,
  "resultStatus": 200,
  "leaderboardStatus": 200,
  "leaderboardEntries": 2,
  "matchId": "70fe5512-a289-499f-9cac-dc03153e13d1",
  "roundId": "25f1f7eb-6467-4a0b-a300-451a69ca3783",
  "lobbyCode": "D6C44E",
  "ratingDeltas": [16, -16],
  "leaks": []
}
```

Runtime cleanup:

- Stopped the tracked API dev process after smoke.
- Final Docker check showed no running `wordle-royale` containers.
- If follow-on tickets need local deps again, start them with:

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm deps:up
```

## Risks / Blockers

- No blocker remains for Ticket 59.
- The helper is intentionally local/dev/test only and is not real authentication.
- The local reset path showed environment-sensitive fragility around Docker Compose config / Prisma reset; the direct `db push --force-reset` + seed path recovered the live smoke. Yuna/Ticket 62 should prefer wrapping this into a single stable script.
- Because the seeded fixture dictionary's answer can differ from the smoke guess, the smoke terminalizes the host with the dev helper after submitting a host guess. Ticket 60 should reduce this artificial step through natural match progression.
