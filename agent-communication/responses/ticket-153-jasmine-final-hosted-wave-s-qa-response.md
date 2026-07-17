# Ticket 153 — Final Hosted Wave S QA Response

Task: Final Hosted Wave S QA
Agent: Jasmine (QA)
Verdict: **PASS**

## Acceptance criteria checked

| Criterion | Result | Independent hosted evidence |
|---|---:|---|
| Ticket 152 prerequisite and merged release identity | PASS | PR #9 is merged at `8e77aa2d1e2d82d1bd9d22cd0c94ca0572b38f0c`; main CI run `29409486413` completed successfully on that exact SHA; Vercel production deployment `5455757994` reports `success` on the same SHA. |
| Hosted health/readiness and schema-backed reads | PASS | `/healthz`, `/readyz`, `/leaderboard`, and `/ranked/modes` each returned HTTP 200 in three independent cache-busted requests. `/play` displayed database, application schema, and Standard dictionary as `ok`. |
| Profile/leaderboard/play read reliability | PASS | Three cache-busted requests to each of `/`, `/profile`, `/leaderboard`, `/play`, and `/server` returned HTTP 200. Coldest observed web response was 3.850 seconds, within the five-second attempt budget. |
| Truthful fallback and retry | PASS | Signed-out `/profile` used the neutral `Preview profile` identity, showed `Profile unavailable`, and provided a native `Retry profile` button. Activating it preserved `/profile`, performed a fresh navigation/server render, and advanced the live leaderboard generation timestamp from `2026-07-15T11:39:44.278Z` to `2026-07-15T11:40:28.122Z`. No `alice` identity appeared. An invalid live match route truthfully rendered `state unavailable`, hid practice fixtures, and preserved the `matchId` query. |
| Live leaderboard truthfulness | PASS | `/leaderboard` rendered connected live rows with a current generated timestamp. It did not claim fixture-preview or unavailable state while showing those rows. No horizontal overflow was observed. |
| Standard matchmaking regression | PASS | Two fresh, isolated preview sessions produced distinct tickets and one shared in-progress match with exactly two participants. Current-ticket recovery returned the original ticket. |
| No queue/gameplay mutation duplication | PASS | Replaying the same queue `clientRequestId` returned HTTP 200 and the same ticket after the initial HTTP 201. Exactly one guess POST was sent; the authoritative guess count advanced from 0 to 1 and not beyond 1. |
| Metadata/favicon | PASS | `/favicon.ico` returned HTTP 200, `image/vnd.microsoft.icon`, 4,286 bytes, SHA-256 `4230d36a3df7c4d844fafac9e4d77a3532fd947bcd4976ee1627caee57e9c401`. Hosted title, description, `#769656` theme color, and one 32×32 `image/x-icon` link were present. |
| Browser/visual quality | PASS | `/profile`, `/play`, and `/leaderboard` produced zero console messages and zero JavaScript errors. Resource inspection found no failed or over-five-second browser resources. Visual inspection found no overlap, unreadable controls, misleading mode state, or horizontal overflow. Standard was clearly `Live queue`; Speed, Classic, and Multiplayer were each `Not live yet`. |
| Spoiler/secret safety | PASS | Hosted HTML, browser DOM, and sanitized gameplay responses contained no answer-authority hash/salt fields, database URLs, credentials, private-key patterns, Prisma/SQL detail, or stack traces. Cookies, session identifiers, user IDs, ticket IDs, match IDs, the submitted word, and feedback were not retained in this report. |

## Commands run + exit codes

- Public GitHub API verification for PR #9, exact-SHA Actions run, and deployment status — exit 0.
- Three-pass hosted HTTP timing/metadata/security probe — exit 0.
  - API timings:
    - `/healthz`: 0.764–1.543s
    - `/readyz`: 1.197–1.928s
    - `/leaderboard`: 1.231–1.420s
    - `/ranked/modes`: 0.648–0.723s
  - Web timings:
    - `/`: 1.898–3.850s
    - `/profile`: 1.435–1.930s
    - `/leaderboard`: 1.367–1.886s
    - `/play`: 1.392–2.453s
    - `/server`: 1.369–1.462s
- First hosted lifecycle harness attempt — exit 1 because the QA client omitted required `mode` and `rated` request fields; it stopped before a queue ticket was accepted. This was a harness defect, not a server defect.
- Corrected isolated-session queue/gameplay harness — exit 0.
- Cleanup plus `git diff --check` — exit 0.

## Browser/visual evidence

- `/profile`:
  - neutral `Preview profile` heading;
  - truthful signed-out profile fallback;
  - native retry button;
  - fresh server-render timestamp after retry;
  - no `alice` identity and no horizontal overflow.
- `/play`:
  - Standard live queue visible;
  - three future modes explicitly unavailable;
  - server dependencies shown healthy;
  - invalid live-match state remained truthful and hid practice fixtures;
  - no answer-authority fields in DOM;
  - no visible layout blocker.
- `/leaderboard`:
  - connected live standings and generated timestamp;
  - clear provisional labels;
  - no unavailable/fixture-state contradiction;
  - no failed resources, console output, JavaScript errors, or horizontal overflow.

## Findings

### Release blockers

None.

### Non-blocking operational note

Wave S is web-only. Vercel exposes an exact-SHA successful production deployment. Railway correctly reported that no API deployment was needed because watched API paths were unchanged; the hosted API remains healthy, but this shell cannot read a Railway-native build revision directly. Runtime and public GitHub deployment/check evidence are sufficient for this ticket.

### QA harness note

The initial mutation harness used an incomplete matchmaking request shape and exited before queue acceptance. The corrected harness used the committed contract and passed. The successful smoke created two disposable preview sessions, one normal preview match, and one accepted guess through supported public behavior. No provider setting, environment variable, dictionary data, or database was directly modified.

## Required fixes / owner

None.

Optional operational improvement — **Yuna**: expose Railway service revision/build identity in a read-only release evidence path so future QA can correlate the hosted API revision without provider-console access.

## Residual risks

- No provider outage was injected because provider-setting changes are prohibited. Exhausted/transient recovery is covered by Ticket 156's production-shaped deterministic verification; this hosted run proved real cold reads stayed within budget and the deployed retry action caused a fresh render.
- This was a focused release smoke, not a load, soak, cross-region, or physical-mobile-device test.
- Preview demo records may reset by product policy; the supported hosted smoke necessarily leaves ephemeral preview match data because production dev-terminalization and direct database cleanup are prohibited.

## Cleanup

- Removed `/tmp/ticket153_hosted_probe.py`.
- No Jasmine API, web, mock, or probe process remains.
- No provider setting, environment variable, deployment, dictionary release, or database operation was changed.
- Shared worktree was preserved. The pre-existing untracked Ticket 152 response remains untouched.
- `git diff --check` exited 0.

## Final recommendation

**PASS.** Wave S's hosted reliability polish is release-acceptable. The two historical Ticket 150 blockers remain resolved in production, Standard matchmaking and mutation idempotency remain healthy, and there is no Ticket 153 blocker requiring rollback.
