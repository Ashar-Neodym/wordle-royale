# Ticket 229 — Ruby Response

## PASS

Repaired the uncommitted Ticket 228 hosted Speed smoke harness using local deterministic fixtures only. No environment was sourced, no network/hosted/provider/GitHub access occurred, and the confirmed harness was not executed.

### Truthfulness/safety repairs

- Replaced status-only acceptance with runtime shape and identity validation for result, both histories, both Speed profiles, Speed leaderboard, Standard profile/leaderboard baselines, and exact once-only rating convergence.
- Added terminal cleanup verification through both current Speed/Standard ticket reads and terminal match-state reads.
- Added recursive fail-closed spoiler-key scanning for every accepted successful public response body.
- Requires non-null immutable post-ack timing identities and validates exact 20s ready, 3s countdown, and 75s round contracts with an explicit 25ms tolerance; proves both reconnect snapshots are locked at two ready actors.
- Requires the invitation budget to be exactly 90s within tolerance and strictly exceed the 35s ready timeout plus 5s recovery reserve.
- Proves distinct session-cookie identities, user identities, handles, tickets, matched opponents, snapshot participants, and one fresh shared match absent from both baselines.
- Preserved the explicit hosted confirmation guard, five unique mutation IDs, one-lifecycle guard, and no blind mutation retry behavior.
- Fixtures now use committed envelope style (`{ data, error }`), nested preview-session `user.profile.handle`, committed ticket/opponent fields, and realistic result/history/profile/leaderboard fields.

### Permanent local negative coverage

Covers opaque 2xx payloads, missing immutable timestamps, invitation and round deadline mismatches, duplicate actors, duplicate tickets, duplicate participants, recursive spoiler-shaped keys, unapplied result, missing history, stale Speed profile, stale Speed leaderboard, changed Standard baselines, and non-terminal cleanup.

### Verification

- Focused syntax + deterministic tests: **16 passed, 0 failed**
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm secret-scan`: PASS (**301 files scanned**)
- `git diff --check`: PASS

### Changed files

- `package.json`
- `scripts/hosted-speed-smoke-core.mjs`
- `scripts/hosted-speed-smoke.mjs`
- `scripts/hosted-speed-smoke.test.mjs`
- `agent-communication/responses/ticket-229-ruby-hosted-speed-smoke-harness-truthfulness-repair-response.md` (this response, outside the task worktree)

No commit, push, or PR was created.
