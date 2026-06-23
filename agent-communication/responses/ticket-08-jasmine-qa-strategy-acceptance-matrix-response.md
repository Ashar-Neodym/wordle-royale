# Ticket 8 — QA Strategy and Acceptance Test Matrix — Response

## Summary

Created a QA strategy, acceptance test matrix, and release-gate checklist for Wordle Royale. This is a planning/specification QA deliverable based on the Ticket 8 assignment plus the available Elisa PRD, Elisa architecture/API contract, and Freya game-engine/scoring/rating specification.

No product implementation was tested because this ticket is a QA planning/spec task and no assigned implementation artifact was provided for execution.

## Decisions / Recommendations

1. **Make server-authoritative gameplay the primary QA risk area.** Clients must never authoritatively validate guesses, calculate feedback, reveal answers, compute scores, finalize matches, or update ratings.
2. **Treat duplicate-letter feedback as release-blocking correctness.** Freya’s two-pass feedback algorithm must be covered by deterministic unit tests and regression fixtures.
3. **Use layered automated testing.** Required layers: game-engine unit/property tests, REST contract tests, WebSocket/realtime tests, DB/idempotency tests, frontend component tests, E2E smoke tests, load tests, and security/privacy checks.
4. **Require deterministic QA fixtures.** Use seeded users, lobbies, matches, dictionaries, clock/timer controls, known duplicate-letter word pairs, fixed scoring examples, and fixed rating examples.
5. **Gate ranked play more strictly than unranked.** Rating finalization, leaderboard updates, abandon/void handling, anti-cheat telemetry, and answer secrecy must pass before ranked beta.
6. **Use snapshot-based reconnect QA as a P0 test area.** Web and mobile reconnect/backgrounding must prove that server state, timer, guesses, score, and answer reveal policy remain correct.
7. **Add privacy/consent validation before analytics instrumentation spreads.** Necessary gameplay/security events must be separated from product analytics and training/insight consent scopes.
8. **Block release on fairness/security defects.** Answer leakage, client-trusted scoring/timing, duplicate rating application, unauthorized private lobby/match access, and consent bypass are P0 blockers.

## Detailed Output

## 1. QA Objectives

QA must verify that Wordle Royale is:

- Functionally correct across auth, onboarding, lobbies, public lobby browser, quick matchmaking, gameplay, profiles, leaderboards, analytics, admin, and moderation.
- Fair and cheat-resistant for competitive/ranked play.
- Consistent across web and mobile clients.
- Reliable under reconnects, backgrounding, network transitions, server restarts, and duplicate/retried requests.
- Privacy-aware and consent-compliant.
- Performant enough for realtime multiplayer.
- Release-ready for web, iOS, and Android expectations.

## 2. Test Environment Strategy

| Environment | Purpose | Required data/tools |
|---|---|---|
| Local developer | Fast unit/component/contract feedback | Seeded dictionaries, fixed clock utilities, local PostgreSQL/Redis or test containers |
| CI | Pull-request regression gate | Typecheck, lint, unit, integration, API/WS contract, deterministic engine fixtures |
| QA/staging | Manual QA, E2E, load smoke | Production-like PostgreSQL/Redis/WebSocket setup, sandbox auth, analytics sandbox |
| Closed beta | Real-user behavior and telemetry | Feature flags, crash reporting, admin tools, rating reset/void capability |
| Production | Release monitoring | Observability, alerts, rollback, audit logs, incident playbooks |

Required QA fixtures:

- Users: anonymous visitor, new registered user, verified user, rated-eligible user, provisional ranked user, established ranked user, suspended user, banned user, moderator, admin.
- Lobbies: private, public, full, expired, abandoned, already-started, rated-compatible, rated-incompatible.
- Matches: 1v1, 3-player, 4-player, unrated, rated, abandoned, voided, reconnectable, completed.
- Words: answer words, guess-valid-only words, banned words, offensive/sensitive words, duplicate-letter fixtures, difficulty-tagged words.
- Timers: frozen clock, accelerated timeout, exact deadline-boundary submits, client clock skew.
- Network: disconnect, reconnect, duplicate request, stale client state, delayed/out-of-order WebSocket events.

## 3. Automated Test Layer Plan

| Layer | Scope | Recommended tooling | Required gate |
|---|---|---|---|
| Static checks | Types, lint, schema compatibility | TypeScript `tsc`, ESLint, schema validators | Every PR |
| Pure game-engine unit tests | normalization, word validation, feedback, scoring, standings, rating deltas | Vitest/Jest | Every engine/backend PR |
| Property/fuzz tests | duplicate-letter invariants, state-machine validity, idempotency | fast-check or equivalent | Every engine PR |
| REST contract tests | auth, lobbies, matchmaking, profiles, leaderboards, admin, analytics | Supertest/Playwright API or equivalent | Every API PR |
| WebSocket integration tests | lobby events, match snapshots, guess submit, reconnect/resync, event ordering | Socket.IO/raw WS test harness | Every realtime/gameplay PR |
| Database integration tests | transactions, uniqueness, idempotency, rating finalization, void reversal | PostgreSQL/Redis test containers | Every backend PR |
| Frontend component tests | onboarding forms, board rendering, lobby states, consent UI, accessibility states | React Testing Library | Every frontend PR |
| Web E2E tests | web login, lobby, gameplay, reconnect, match report | Playwright | Main/release candidates |
| Mobile E2E tests | background/foreground, app resume, deep links, gameplay smoke | Maestro/Detox | Release candidates |
| Load/performance tests | WS connections, active matches, guess bursts, matchmaking queue | k6/Artillery/Locust | Pre-beta and pre-release |
| Security tests | auth/session, authorization, rate limits, answer leakage, client tampering | Custom API/WS tests + OWASP ZAP where applicable | Pre-release |
| Analytics/privacy tests | consent gates, schema validation, deletion/export behavior | Integration tests + analytics sandbox assertions | Every analytics change |

## 4. Critical User Journey Tests

| ID | Journey | Acceptance checks | Priority |
|---|---|---|---|
| CUJ-01 | Register/login/onboarding | User registers/logs in, sets display name, completes onboarding, lands on dashboard | P0 |
| CUJ-02 | Session management | Refresh, logout, revoke session, reset password, and suspended/banned account behavior work safely | P0 |
| CUJ-03 | Create private lobby | Host creates private lobby; code/link works; lobby is not public | P0 |
| CUJ-04 | Join by code | Valid code joins; invalid/expired/full/started codes return clear errors | P0 |
| CUJ-05 | Public lobby browser | Only joinable public lobbies show; filters work; race to full lobby handled | P0 |
| CUJ-06 | Quick matchmaking | Queue starts, prevents duplicates, matches compatible users, supports cancel/timeout | P0 |
| CUJ-07 | Lobby start | Host can start only when rules/min players satisfied; settings lock on start | P0 |
| CUJ-08 | Standard match completion | Players play all rounds; answer hidden until round end; report generated | P0 |
| CUJ-09 | Invalid guess handling | Invalid guesses show reason, do not consume attempts, and time continues | P0 |
| CUJ-10 | Reconnect mid-round | User reconnects to authoritative snapshot with prior guesses/timer; no answer leak | P0 |
| CUJ-11 | Mobile background/foreground | Background does not corrupt state; foreground resync works; timer continues | P0 |
| CUJ-12 | Rated match | Rating deltas apply exactly once; leaderboard/profile update; report shows rating impact | P0 |
| CUJ-13 | Voided rated match | Admin void suppresses/reverses rating effects and creates audit trail | P0 |
| CUJ-14 | Profile/stats | Match history, rating history, profile privacy, and stats update correctly | P1 |
| CUJ-15 | Analytics consent | Necessary events work; optional analytics/training events respect consent | P0 |
| CUJ-16 | Admin/moderation | Admin can review reports, suspend/ban, hide leaderboard, void match, manage words with audit logs | P0 for launch minimum |
| CUJ-17 | Accessibility/cross-platform | Colorblind/high contrast, keyboard/screen reader, web/mobile layout parity pass | P1/P0 for app-store accessibility baseline |

## 5. Manual QA Checklist

### Auth and onboarding

- [ ] Register with valid credentials/auth provider.
- [ ] Reject invalid credentials safely.
- [ ] Verify email flow if enabled.
- [ ] Login/logout on web and mobile.
- [ ] Refresh session without user disruption.
- [ ] Revoke a single device session.
- [ ] Log out all devices.
- [ ] Password reset invalidates appropriate sessions.
- [ ] Suspended/banned users cannot enter gameplay.
- [ ] Onboarding explains rules, multiplayer, scoring, ranked/unranked, and privacy/consent.
- [ ] Onboarding resumes after refresh/app restart.

### Dashboard

- [ ] Dashboard shows identity/profile info.
- [ ] Dashboard shows rating/rank when ranked enabled.
- [ ] Primary actions are visible: create lobby, join by code, quick join, browse lobbies, profile, leaderboards.
- [ ] Active/rejoinable match is visible and opens correct snapshot.
- [ ] Maintenance/moderation/update notices render when configured.

### Lobbies and matchmaking

- [ ] Create public/private lobby.
- [ ] Edit settings only while allowed.
- [ ] Rated lobbies lock ranked-compatible settings.
- [ ] Join by code/link.
- [ ] Invalid/expired/full/already-started errors are clear.
- [ ] Ready check works if enabled.
- [ ] Host transfer works before match start.
- [ ] Host leaving during match does not corrupt match.
- [ ] Public lobby expires/removes from browser.
- [ ] Quick join prevents duplicate queue entries.
- [ ] Quick join cancellation cleans queue state.
- [ ] Quick join timeout presents retry/create/broaden options.

### Gameplay

- [ ] Match starts with server timestamp/countdown.
- [ ] Round state renders correctly.
- [ ] Valid guesses accepted.
- [ ] Invalid guesses rejected without consuming attempts.
- [ ] Duplicate submissions are idempotent.
- [ ] Feedback states are correct, especially duplicate letters.
- [ ] All players get same hidden answer per round.
- [ ] Answer is not visible before round completion.
- [ ] Round ends on solve, max valid guesses, timeout, forfeit, or disconnect policy.
- [ ] Match report shows round-by-round score breakdown.

### Ranked/leaderboard/profile

- [ ] Rated match requires authenticated eligible users.
- [ ] Rated match enforces approved settings and ranked dictionary.
- [ ] Rating delta applies once per user/match/mode.
- [ ] Voided match suppresses/reverses rating impact.
- [ ] Leaderboard pagination/filtering works.
- [ ] Banned/deleted/private users are excluded/hidden per policy.
- [ ] Duplicate display names are disambiguated.
- [ ] Profile privacy settings are enforced.

### Accessibility and cross-platform

- [ ] Keyboard navigation works on web.
- [ ] Colorblind/high-contrast feedback is distinguishable.
- [ ] Reduced motion is respected.
- [ ] Screen reader labels exist for board cells, keyboard, timer, and status updates.
- [ ] Mobile layout works on small phones and tablets.
- [ ] Native keyboard/input does not obscure board/actions.
- [ ] Deep links open correct lobby/match on web and mobile.

### Admin/moderation

- [ ] Admin/moderator role required for admin endpoints/UI.
- [ ] User search works.
- [ ] Ban/suspend/restore works and writes audit log.
- [ ] Report review works.
- [ ] Match voiding works and writes audit log.
- [ ] Word activation/deactivation/versioning works.
- [ ] Admin-only active answers never leak to normal users.

## 6. E2E Test Scenarios

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| E2E-01 | New user private match | Register 2 users → onboarding → user A creates private lobby → user B joins by code → start match → complete match | Match completes; report generated; no rating delta if unrated |
| E2E-02 | Public lobby race | A creates public 2-player lobby → B and C attempt join simultaneously | One joins; one receives `LOBBY_FULL`; browser updates |
| E2E-03 | Quick join timeout | User queues with no compatible match | Timeout event/message; queue entry cleaned; retry/create/broaden options shown |
| E2E-04 | Quick join success | Two compatible users queue | Both matched once; no duplicate tickets/lobbies/matches |
| E2E-05 | Full rated match | Rated-eligible users complete ranked match | Rating event inserted once per participant; leaderboard/report/profile update |
| E2E-06 | Reconnect during active round | User submits guesses → disconnects → reconnects before deadline | Snapshot restores guesses/timer/score; no answer leak; user can continue |
| E2E-07 | Reconnect after round ended | User disconnects past timeout | User sees completed/timed-out state; no stale active board |
| E2E-08 | Mobile background timeout | Mobile user backgrounds beyond timer | Server times out; foreground shows result/timeout state |
| E2E-09 | Invalid guess spam | Submit many invalid guesses rapidly | Attempts not consumed; rate limit eventually applies; server remains stable |
| E2E-10 | Duplicate guess submit | Send same `clientRequestId` twice | Same result returned; one guess row/effect |
| E2E-11 | Idempotency conflict | Same `clientRequestId` with different payload | Reject with idempotency conflict; no second effect |
| E2E-12 | Host leaves before start | Host creates lobby, second player joins, host leaves | Host transfers or lobby abandons per policy |
| E2E-13 | Host leaves during match | Host disconnects mid-match | Match continues if viable players remain |
| E2E-14 | Voided completed rated match | Admin voids match after rating applied | Reversal/suppression rating events; audit log; leaderboard corrected |
| E2E-15 | Consent toggles | User opts out of product/training analytics | Optional events stop/reject/downgrade; necessary events still work |
| E2E-16 | Account deletion | User deletes account | Sessions revoked; profile/leaderboard visibility follows policy |
| E2E-17 | Cross-platform match | Web user and mobile user play together | Same game state, feedback, timer, and report across platforms |

## 7. WebSocket / Realtime Edge-Case Matrix

| Case | Trigger | Expected behavior | Priority |
|---|---|---|---|
| WS-01 | Connect without/invalid token | Connection rejected; no room data | P0 |
| WS-02 | Token expires mid-connection | Re-auth or safe disconnect; no unauthorized events | P0 |
| WS-03 | Subscribe to unauthorized lobby | Denied without leaking private data | P0 |
| WS-04 | Subscribe to unauthorized match | Denied without answer/match leakage | P0 |
| WS-05 | Duplicate `guess.submit` same request ID | Idempotent result; one persisted effect | P0 |
| WS-06 | Same request ID with different payload | Reject `idempotency_key_conflict` | P0 |
| WS-07 | Guess at timeout boundary | Server receipt time decides deterministically | P0 |
| WS-08 | Simultaneous final guesses | Lock/server timestamps preserve deterministic result | P0 |
| WS-09 | Out-of-order events | Client reconciles via snapshot/server state | P0 |
| WS-10 | Reconnect stale round ID | Server sends current snapshot/resync result | P0 |
| WS-11 | Lobby overfill race | Lock/transaction allows only capacity | P0 |
| WS-12 | Duplicate match start | One match created; duplicate start idempotent/conflict | P0 |
| WS-13 | Lobby expires during join | Deterministic success/failure; no orphan member | P0 |
| WS-14 | Redis restart during lobby | Durable state recoverable or safe resync | P1/P0 before production |
| WS-15 | Server restart during match | Active match recovers or is safely voided | P0 before production |
| WS-16 | Match finalization retry | Scores/rating apply exactly once | P0 |
| WS-17 | Client clock skew | Server timestamps govern timers/scoring | P0 |
| WS-18 | Delayed client after round end | Late guesses rejected unless idempotent replay of accepted pre-deadline request | P0 |
| WS-19 | Mobile socket suspended | Foreground resync restores current state | P0 |
| WS-20 | Public progress event | Opponent progress excludes hidden answer/private guesses unless product explicitly allows | P0 |

## 8. Mobile Background / Reconnect Matrix

| Case | App state | Network | Match state | Expected result |
|---|---|---|---|---|
| MOB-01 | Background 5s | Online | Round active | Foreground resumes; timer advanced server-side |
| MOB-02 | Background past round timer | Online | Round active | Timeout/fail shown on return |
| MOB-03 | OS kills app | Online on relaunch | Match active | Session restores and current snapshot loads if eligible |
| MOB-04 | Airplane mode 10s | Offline | Round active | UI shows reconnecting; resync on return |
| MOB-05 | Airplane mode beyond grace/deadline | Offline | Rated match | Timeout/forfeit per policy; clear return message |
| MOB-06 | Wi-Fi to cellular switch | Intermittent | Lobby waiting | Membership preserved; presence updates |
| MOB-07 | Network drops during guess submit | Intermittent | Round active | `clientRequestId` prevents duplicate; result appears after resync |
| MOB-08 | Push notification opens app | Online | Rejoinable lobby/match | Deep link opens correct snapshot |
| MOB-09 | App update with active match | Online | Active/rejoinable | Compatibility handled; safe update/rejoin path |
| MOB-10 | Device clock wrong | Online | Any | Server time controls; UI display does not affect scoring |
| MOB-11 | Low-memory restart | Online | Active match | No crash loop; resync works |
| MOB-12 | Screen locked mid-round | Online/offline | Round active | Timer continues; unlock shows current/result state |

## 9. Game-Engine Correctness Matrix

| Area | Required tests | Expected behavior |
|---|---|---|
| Normalization | whitespace, uppercase, mixed case | Trim/lowercase consistently |
| Character set | symbols, numbers, accents for English V1 | Reject unsupported input |
| Word length | non-5-letter input in V1 | Reject with `wrong_length` |
| Dictionary | valid guess, unknown word, banned word | Guess-valid list accepted; banned excluded |
| Answer list | target selection | Only active approved answer list used |
| Invalid guesses | invalid during active round | No attempt consumed; time continues; rejection reason returned |
| Guess limit | 6 valid guesses without solve | Player round becomes failed |
| Solve | guess equals answer | Player round becomes solved; score once |
| Timeout | deadline passes | Active players become timed_out; score 0 |
| Duplicate submissions | same `clientRequestId` | Idempotent; no duplicate guess/score |
| Duplicate letters | repeated letters in answer/guess | Two-pass Wordle algorithm; no over-crediting |
| Answer secrecy | active snapshots/events/logs | No answer before completed round |
| Round state | pending/countdown/active/finalizing/completed/voided | Invalid transitions rejected |
| Match state | initializing/countdown/in_progress/intermission/finalizing/completed/abandoned/cancelled/voided | State machine enforced |
| Final standings | total score/tie-breakers | Deterministic placement |
| Match report | completed report | Includes score breakdown and answer only after reveal policy allows |
| Restart/recovery | Redis/backend restart | Recover from durable state or safe void |

### Duplicate-letter fixture tests from Freya spec

Use exact enum values: `correct`, `present`, `absent`.

| Answer | Guess | Expected feedback | Why |
|---|---|---|---|
| `apple` | `allee` | `correct present absent absent correct` | exact `a`/final `e`; one remaining `l`; extra `l/e` absent |
| `cigar` | `civic` | `correct correct absent absent absent` | exact `c/i`; no extra availability |
| `belle` | `level` | `present correct absent present absent` | exact `e`; one `l` and one remaining `e` present |
| `allee` | `eagle` | `present present absent present correct` | final `e` exact; first `e`, `a`, `l` present; `g` absent |
| `mamma` | `maxim` | `correct correct absent absent present` | `m/a` exact; final `m` present; `x/i` absent |
| `array` | `rarer` | `present present absent absent present` | only available `r/a` counts credited |
| `banal` | `llama` | `absent absent present absent present` | one `l` and one later `a` credited after exact pass |

Required invariants:

- Non-absent feedback count for any letter must never exceed the answer’s count for that letter.
- Exact-position matches must be allocated before present-position matches.
- Feedback length always equals word length.
- Guess/answer are normalized before scoring.

## 10. Scoring / Rating Correctness Checks

### Scoring formula under QA

Freya specified `standard_v1`:

```text
base_score = solved ? 100 : 0
1 guess: +60
2 guesses: +50
3 guesses: +40
4 guesses: +25
5 guesses: +10
6 guesses: +0
remaining_time_ratio = clamp((round_time_seconds - solve_elapsed_seconds) / round_time_seconds, 0, 1)
speed_bonus = solved ? round(50 * remaining_time_ratio) : 0
round_score = base_score + guess_bonus + speed_bonus
```

| ID | Scenario | Expected result |
|---|---|---:|
| SCORE-01 | solved in 3 guesses at 45s of 120s | `100 + 40 + round(50 * 75/120) = 171` |
| SCORE-02 | solved in 5 guesses at 90s of 120s | `100 + 10 + round(50 * 30/120) = 122` |
| SCORE-03 | timeout/failed | `0` |
| SCORE-04 | solved in 1 guess at 10s of 120s | `100 + 60 + round(50 * 110/120) = 206` |
| SCORE-05 | invalid guesses before solve | invalid guesses do not affect valid guess count or score |
| SCORE-06 | duplicate accepted request replay | same result returned; no duplicate score event |
| SCORE-07 | finalization retry | no duplicate score events |
| SCORE-08 | multi-round match | total equals sum of finalized round scores |
| SCORE-09 | tie-breakers | total score → rounds solved → total valid guesses → total solve ms → final-round result → best single-round score → declared tie |

### Rating checks

Freya recommended a custom placement-based MMR for V1:

```text
expected_i_vs_j = 1 / (1 + 10 ^ ((rating_j - rating_i) / 400))
actual_i_vs_j = 1.0 if i placed above j, 0.5 if tied, 0.0 if below
raw_delta_i = K * sum(actual_i_vs_j - expected_i_vs_j for every j != i)
```

Recommended test fixtures from Freya:

| ID | Scenario | Expected result |
|---|---|---|
| RATE-01 | 4 equal-rated players A > B > C > D, all 1500 | A +36, B +12, C -12, D -36 |
| RATE-02 | Upset: B1500 > A1700 > C1500 > D1300 | A -10, B +36, C -12, D -14 |
| RATE-03 | Tie second: A > B=C > D, all 1500 | A +36, B 0, C 0, D -36 |
| RATE-04 | Unrated match | no rating event generated |
| RATE-05 | Rated finalization retry | no duplicate rating events; same final ratings |
| RATE-06 | Voided after finalization | reversing rating events or approved suppression; never silent mutation |
| RATE-07 | Provisional player | provisional multiplier applies only if configured |
| RATE-08 | Rating cap | max gain/loss cap enforced if configured |
| RATE-09 | Suspicious match | rating delay/void policy applied if anti-cheat confidence requires |
| RATE-10 | Leaderboard update | leaderboard materializes corrected rank after rating changes |

## 11. Word-Library QA Checks

| Area | Required checks |
|---|---|
| Source provenance | Every imported word has source/version metadata |
| Answer vs guess-valid | Answer list stricter; guess-valid may be broader; answer must also be valid guess |
| Banned/excluded | Offensive/sensitive/proper-noun/problematic terms excluded from active answers |
| Difficulty | Difficulty tags exist and are reviewable/reproducible |
| Language/length | English 5-letter V1 enforced unless product changes |
| Duplicates | Case-insensitive duplicates removed |
| Normalization | ASCII/lowercase/trim policy tested |
| Dictionary version | Match/round stores dictionary version for reproducibility |
| Rollback | Bad word/list version can be deactivated without app update |
| Admin workflow | Word edits require admin/content role and audit trail |
| Regression fixtures | Duplicate-letter words included in test lists |
| Privacy/security | Client does not receive answer list in a way that reveals active/future answers |

Release-blocking word-library issues:

- Offensive/slur word appears as an answer.
- Answer selected from banned/inactive list.
- Match does not record dictionary version.
- Client can infer current/future answers from payloads.

## 12. Analytics / Privacy QA Checks

| Area | Checks |
|---|---|
| Consent defaults | Optional analytics/training defaults to off unless product/legal approves otherwise |
| Necessary events | Gameplay/security events needed to operate still work without optional consent |
| Product analytics | Product analytics events respect consent scope |
| Training/insight use | Separate from product analytics and explicitly consented where required |
| Event schema | Names/properties validated against event catalog |
| Identifier minimization | Prefer pseudonymous IDs; avoid raw email/IP/user agent where possible |
| Consent changes | Turning consent off stops future optional events |
| Account deletion/export | Required user data rights covered before app-store/public launch |
| Minor policy | Age/minor flow decided and tested before release if applicable |
| Analytics abuse | Rate limits and validation prevent spam/poisoning |
| Admin privacy | Analytics/admin views do not expose unnecessary PII |
| Retention | Raw telemetry retention follows policy |

Sensitive gameplay analytics note: raw guesses, timings, and feedback patterns may be needed for gameplay, anti-cheat, or analytics, but collection scope and retention must be explicitly disclosed and minimized.

## 13. Performance / Load Targets

Targets should be confirmed by Yuna/Athena, but QA recommends these initial gates:

| Area | Target | Measurement |
|---|---:|---|
| Common REST p95 | < 300 ms under expected staging load | API load tests |
| Guess submit p95 server processing | < 150 ms excluding client network | WS/API timing |
| Guess submit p99 burst | < 500 ms | WS/API timing |
| WebSocket connect p95 | < 1 s to authenticated ready | WS harness |
| Match snapshot p95 | < 300 ms | WS/REST timing |
| Public lobby browser p95 | < 500 ms paginated | API load test |
| Reconnect recovery p95 | < 2 s after network restoration | Mobile/web E2E |
| Concurrent WS staging gate | At least 1,000 before public beta, unless Yuna sets another target | Artillery/k6 |
| Concurrent active matches staging gate | At least 100 before public beta, unless Yuna sets another target | Load simulation |
| 5xx rate | < 0.5% under expected load; 0 data-corruption incidents | Observability |
| Redis/backend restart | No silent active-match corruption; recovery or safe void | Chaos/recovery test |

Required load scenarios:

- Many public lobby browse/refresh calls while lobbies expire.
- Burst lobby creation and join-by-code attempts.
- Concurrent quick-join queue start/cancel/timeout.
- Guess bursts at round start/end.
- Mobile reconnect storm after foregrounding.
- Leaderboard updates after rated finalization batch.

## 14. Security / Fairness Checks

| Area | Checks |
|---|---|
| Auth/session | Refresh rotation, revocation, secure web/mobile storage, password reset, session list |
| Authorization | Users cannot access private lobby/match/profile/admin data beyond policy |
| WS auth | Token required; token not in query string if avoidable; reconnect revalidates |
| Rate limits | Auth, lobby create/join, guess submit, reports, analytics ingest |
| Answer secrecy | Active answer absent from client payloads, progress events, logs, analytics, and errors |
| Client tampering | Client-supplied score/time/validity/rating ignored |
| Idempotency/replay | `clientRequestId` prevents duplicate effects and conflicting replay |
| Timer fairness | Server receipt timestamps decide deadlines and solve times |
| Matchmaking abuse | Duplicate queue entries prevented; rating filters enforced |
| Leaderboard integrity | Banned/voided/suspicious matches/users handled |
| Admin security | Role checks, audit logs, least privilege |
| PII/privacy | No raw secrets/tokens/passwords in logs/events; IP/user agent hashed if stored |
| Dependency security | Package audit and dependency pinning in CI |
| Abuse/moderation | Offensive names, reports, suspicious solves reviewable |

Security/fairness release blockers:

- Any active answer leak.
- Client can alter authoritative score, timer, rating, validity, or result.
- Unauthorized access to private lobby/match/admin data.
- Optional analytics/training sent after opt-out.
- Tokens/passwords/answers logged or stored in analytics.

## 15. Release-Gate Checklist

### Alpha/internal gate

- [ ] PRD/architecture/game-engine specs accepted or open questions explicitly tracked.
- [ ] Unit tests cover feedback, scoring, rating fixtures, word validation, and state machines.
- [ ] Auth/session happy and negative paths tested.
- [ ] Basic lobby → match → report E2E passes.
- [ ] CI runs deterministic tests.
- [ ] Seeded QA data exists.

### Closed beta gate

- [ ] Web and mobile smoke E2E pass.
- [ ] Reconnect/background P0 matrix passes.
- [ ] Rated finalization is idempotent.
- [ ] Public lobby and quick-join race tests pass.
- [ ] Active word list reviewed and versioned.
- [ ] Analytics consent tests pass.
- [ ] Admin minimum tooling works for reports, bans/suspensions, match voids, and word deactivation.
- [ ] Observability exists for errors, disconnects, failed joins, finalization failures, queue timeouts, and rating anomalies.
- [ ] Privacy policy/terms/account deletion flow ready if real users participate.

### Public release gate

- [ ] No open P0/P1 bugs.
- [ ] All release-blocking criteria clear.
- [ ] Load targets met or explicitly accepted by Athena/Yuna.
- [ ] Security review passed.
- [ ] App-store privacy/account deletion/reporting requirements satisfied.
- [ ] Rollback/incident plan documented.
- [ ] Monitoring dashboards and alerts active.
- [ ] Beta feedback triaged.
- [ ] Final regression pass completed on supported browsers/devices.

## 16. Release-Blocking Criteria

### Gameplay/fairness blockers

- Active answer visible/inferable before reveal policy allows.
- Duplicate-letter feedback incorrect.
- Valid/invalid guesses affect attempts incorrectly.
- Timer is client-authoritative or inconsistent.
- Score calculation duplicates, skips, or corrupts score events.
- Rating updates apply more than once or fail for completed rated matches.
- Voided/suspicious matches cannot be handled safely.
- Leaderboard shows corrupted or unauthorized entries.

### Realtime/reliability blockers

- Users cannot reliably reconnect to active matches.
- Lobby join/start can overfill or create duplicate matches.
- Quick join creates duplicate active queue entries.
- Server/Redis restart causes silent match corruption.
- State machines allow invalid production transitions.

### Security/privacy blockers

- Auth/session vulnerability with account takeover or unauthorized access risk.
- Admin/moderation endpoints accessible to non-admins.
- Private lobby/match data leaks to non-members.
- Optional analytics/training data sent without required consent.
- Required account deletion/privacy disclosure missing for app-store/public launch.
- Sensitive tokens/passwords/answers logged or stored in analytics.

### UX/product blockers

- New user cannot complete onboarding/login.
- Core lobby → match → report flow fails on any launch platform.
- Mobile background/foreground breaks active game state.
- Accessibility/colorblind feedback is insufficient to distinguish states.
- Offensive/banned words appear as answers.

## 17. Bug Severity Definitions

| Severity | Definition | Examples | Release impact |
|---|---|---|---|
| P0 Blocker | Data loss, security breach, cheating/fairness corruption, core gameplay unusable | answer leakage, auth bypass, rating duplication, match cannot complete | Blocks beta/public release |
| P1 Critical | Major journey broken or high-risk regression with weak/no workaround | create lobby fails, reconnect fails, quick join duplicates, mobile crash in match | Blocks release candidate/public release |
| P2 Major | Important feature broken with workaround or limited segment affected | leaderboard pagination bug, delayed stat update, admin filter broken | Must triage before release; may block |
| P3 Minor | Low-risk functional/cosmetic issue | text overflow, non-critical analytics label typo | Can ship if documented |
| P4 Trivial | Polish/nit | copy tweak, low-priority visual refinement | Does not block |

Required labels:

- `security`
- `privacy`
- `fairness`
- `realtime`
- `mobile`
- `web`
- `analytics`
- `admin`
- `word-library`
- `rating`
- `accessibility`

## 18. Beta Testing Plan

### Phase 0 — Internal deterministic QA

Participants: agents/developers/internal testers only.

Goals:

- Verify engine correctness with deterministic fixtures.
- Verify core auth/lobby/match/report flows.
- Confirm QA seed data and admin tools.
- Stabilize logging/observability.

Exit criteria:

- No P0/P1 defects in core journeys.
- Engine unit/property tests pass.
- Basic web/mobile E2E smoke passes.

### Phase 1 — Closed friends/family beta

Participants: small invited group, likely 10–50 users.

Goals:

- Validate onboarding clarity.
- Observe lobby creation/join/quick-join usability.
- Collect reconnect/backgrounding telemetry.
- Review word difficulty/offensive-word reports.
- Confirm admin moderation workflow.

Controls:

- Feature flags for ranked mode if rating remains risky.
- Admin ability to void matches and reset beta leaderboard.
- Clear beta disclaimer.

Exit criteria:

- No unresolved P0/P1 bugs.
- Crash-free sessions and reconnect reliability meet agreed thresholds.
- Word reports triaged.
- Analytics consent confirmed.

### Phase 2 — Ranked/rating beta

Participants: limited competitive cohort.

Goals:

- Validate scoring/rating balance.
- Detect suspicious solve patterns.
- Stress leaderboard updates.
- Test match void/reversal workflows.

Controls:

- Mark leaderboard beta/provisional.
- Allow rating reset before full launch.
- Monitor rating anomalies daily.

Exit criteria:

- Rating finalization idempotent in production-like conditions.
- No leaderboard corruption.
- Anti-cheat review queue actionable.

### Phase 3 — Limited public beta

Participants: broader public but capped.

Goals:

- Validate scale assumptions.
- Confirm app-store/web readiness.
- Tune matchmaking and onboarding.
- Finalize release blockers and go/no-go.

Exit criteria:

- Load targets met or revised with explicit approval.
- Release gate checklist passed.
- Support/moderation process ready.

## 19. Acceptance Criteria Coverage Matrix

| Ticket acceptance criterion | Covered |
|---|---|
| Critical user journey tests | Yes — section 4 |
| Automated test layer plan | Yes — section 3 |
| Manual QA checklist | Yes — section 5 |
| E2E test scenarios | Yes — section 6 |
| WebSocket/realtime edge-case matrix | Yes — section 7 |
| Mobile background/reconnect matrix | Yes — section 8 |
| Game-engine correctness matrix | Yes — section 9 |
| Scoring/rating correctness checks | Yes — section 10 |
| Word-library QA checks | Yes — section 11 |
| Analytics/privacy QA checks | Yes — section 12 |
| Performance/load targets | Yes — section 13 |
| Security/fairness checks | Yes — section 14 |
| Release-blocking criteria | Yes — section 16 |
| Bug severity definitions | Yes — section 17 |
| Beta testing plan | Yes — section 18 |
| Follow-up QA tickets | Yes — Follow-up Tickets section |

## Open Questions

1. What final launch browser/device matrix should QA certify?
2. What exact beta/public load targets does Yuna/Athena want for concurrent users, active matches, and WebSocket connections?
3. Should ranked V1 support 2–4 players immediately, or start with 1v1 while unranked supports larger lobbies?
4. Should ranked difficulty use one shared queue/rating or separate rating buckets by difficulty?
5. What is the exact rated abandon threshold for “meaningful play” before rating impact applies?
6. Are match reports public, participant-only, or private by default?
7. Is product analytics opt-in or opt-out, and which gameplay events are classified as strictly necessary?
8. Is the product intended for minors? This affects privacy, app-store disclosures, and moderation requirements.
9. Will ranked mode be enabled during first beta or held behind a feature flag until rating simulations complete?

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Athena
- **Why that agent is needed:** Athena owns decision routing and sequencing.
- **Exact task:** Resolve QA-impacting open decisions: ranked player count, ranked timer, difficulty/rating buckets, abandon policy, match report visibility, analytics consent model, minors policy, and launch device/browser matrix.
- **Inputs/context they need:** This QA matrix, Elisa PRD/API architecture, Freya game-engine/scoring/rating spec.
- **Expected output back to Athena:** Approved decisions and updated implementation/release sequencing.

### Follow-up ticket 2

- **Target agent:** Elisa
- **Why that agent is needed:** QA needs stable, machine-checkable contracts for automated API/WS tests.
- **Exact task:** Convert REST/WebSocket contracts into schemas, event enums, canonical error codes, and explicit state-transition diagrams.
- **Inputs/context they need:** Ticket 02 response, Freya engine spec, this QA matrix.
- **Expected output back to Athena:** Contract/schema package or document ready for implementation and contract tests.

### Follow-up ticket 3

- **Target agent:** Freya
- **Why that agent is needed:** Engine implementation and tests must encode the spec fixtures.
- **Exact task:** When implementation begins, implement game-engine unit tests for duplicate-letter feedback, scoring examples, state reducers, final standings, idempotency, and placement-MMR examples from this QA matrix.
- **Inputs/context they need:** Freya Ticket 04 spec and this QA matrix.
- **Expected output back to Athena:** Implemented tests with command output and paths changed.

### Follow-up ticket 4

- **Target agent:** Ruby
- **Why that agent is needed:** Word-list validation and QA fixtures need tooling/data support.
- **Exact task:** Create/import QA fixture dictionaries for answer words, guess-valid words, banned words, duplicate-letter cases, and analytics event validation fixtures.
- **Inputs/context they need:** Ruby word-library plan, this QA matrix, Freya duplicate-letter fixtures.
- **Expected output back to Athena:** Fixture/tooling plan or files/scripts with validation commands.

### Follow-up ticket 5

- **Target agent:** Yuna
- **Why that agent is needed:** Performance/load and release gates depend on environment and observability.
- **Exact task:** Define staging/beta QA environment, load-test harness, monitoring dashboards, alert thresholds, rollback plan, and app-store release checklist.
- **Inputs/context they need:** This QA matrix, Elisa architecture, deployment plan ticket.
- **Expected output back to Athena:** QA environment and release-readiness operations checklist.

### Follow-up ticket 6

- **Target agent:** Luna
- **Why that agent is needed:** QA needs testable UX flows and accessibility states.
- **Exact task:** Add QA/testability requirements to onboarding, lobby, gameplay, reconnect, match report, profile, leaderboard, settings, and admin flows, including stable test IDs and accessibility expectations.
- **Inputs/context they need:** This QA matrix, Luna UX plan, Elisa PRD/API contracts.
- **Expected output back to Athena:** UX QA checklist and frontend testability requirements.

### Follow-up ticket 7

- **Target agent:** Jasmine
- **Why that agent is needed:** This strategy should become executable when code exists.
- **Exact task:** After initial implementation, convert this matrix into an executable QA runbook with exact commands, test IDs, fixtures, CI gates, and pass/fail evidence requirements.
- **Inputs/context they need:** Implemented repository structure, test framework, seed data, API/WS schemas, frontend routes.
- **Expected output back to Athena:** Executable QA runbook and release verification checklist.

## Files Changed

- Created `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-08-jasmine-qa-strategy-acceptance-matrix-response.md`

No application/source files were changed.

## Tests / Commands Run

None — planning/spec task only.

Files inspected using Hermes file tools:

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/tickets/ticket-08-jasmine-qa-strategy-acceptance-matrix.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-01-elisa-product-requirements-document-response.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-02-elisa-architecture-api-response.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-04-freya-game-engine-scoring-rating-spec-response.md`

## Evidence / Result

Created the requested Markdown response file at:

`/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-08-jasmine-qa-strategy-acceptance-matrix-response.md`

The document covers all 16 ticket acceptance criteria:

1. Critical user journey tests.
2. Automated test layer plan.
3. Manual QA checklist.
4. E2E test scenarios.
5. WebSocket/realtime edge-case matrix.
6. Mobile background/reconnect matrix.
7. Game-engine correctness matrix.
8. Scoring/rating correctness checks.
9. Word-library QA checks.
10. Analytics/privacy QA checks.
11. Performance/load targets.
12. Security/fairness checks.
13. Release-blocking criteria.
14. Bug severity definitions.
15. Beta testing plan.
16. Follow-up QA tickets.

## Risks / Blockers

1. **No implementation was available or assigned for this ticket.** This is a QA strategy/spec deliverable, not a verification report against running code.
2. **Some product decisions remain open.** Ranked player count, ranked difficulty buckets, abandon policy, match report visibility, analytics consent model, minors policy, and device/browser support matrix affect final QA gates.
3. **Performance targets are recommended QA starting points, not approved SLOs.** Yuna/Athena should confirm launch and beta scale targets.
4. **Legal/privacy decisions are unresolved.** App-store readiness, age/minor policy, analytics consent, data retention, export/deletion, and training/insight consent require explicit decisions before public beta.
5. **Rating algorithm must be simulation-tested before production ranked launch.** Freya’s custom placement-based MMR is testable, but tuning should be validated with Ruby simulations and beta telemetry.
