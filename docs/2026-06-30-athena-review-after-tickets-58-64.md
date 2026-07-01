# Athena Review After Tickets 58–64 — Wave I Demo-Stable Ranked Loop

Date: 2026-06-30

## Verdict

Wave I is a **CONDITIONAL PASS**.

The product goal mostly landed: ranked demo flow works through HTTP without manual DB edits, seeded stub users exist, dev multi-user helpers are guarded, the web live-match view is cleaner, and the mobile build/live-preview work is present. The remaining blocker is demo friction in the reset script: `pnpm ranked:smoke:reset` still fails in this Athena/Jasmine-style shell unless `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker` is exported. That must be fixed before treating the project as easy to demo or safe to checkpoint/push.

## Athena verification

Athena reran:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:local
pnpm secret-scan
pnpm deps:check
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/web build
pnpm --filter @wordle-royale/mobile build
```

All passed.

Key evidence:

- API tests passed: 32/32.
- Root build passed.
- Web build passed.
- Mobile build passed.
- Secret scan passed: 168 source/config files scanned.
- `pnpm smoke:local` and `pnpm deps:check` passed.

Athena also reran the documented reset flow:

```bash
pnpm deps:up && pnpm ranked:smoke:reset
```

This reproduced Jasmine's conditional issue:

```text
unknown shorthand flag: 'T' in -T
Refusing ranked smoke reset: local Compose PostgreSQL did not become ready within 20 seconds.
reset_exit=1
```

Cleanup with `pnpm deps:down` succeeded.

## Ticket-by-ticket status

| Ticket | Owner | Status | Notes |
|---|---|---|---|
| 58 | Yuna | Mostly pass | Stub users/bootstrap added, but reset still does not fully reuse Compose resolver in this shell. |
| 59 | Freya | Pass | Dev multi-user ranked smoke works through HTTP; dev helper is production-guarded. |
| 60 | Ruby | Pass | Natural terminalization regression coverage added. |
| 61 | Luna | Pass | Live fixture noise removed from live-match view; UI feels better. |
| 62 | Yuna | Conditional | Demo scripts/docs exist, but reset command friction remains. |
| 63 | Luna | Pass with caveat | Mobile build/live preview confirmation present; real-device evidence is from handoff, not Athena rerun. |
| 64 | Jasmine | Conditional pass | Independent QA found no functional P0/P1, but flagged reset demo friction. |

## Product notes from Ashar

1. UI is improved, but still too one-page. Future direction should be more like lichess: multiple pages, dropdowns, and clear navigation sections.
2. Web and mobile must both stay within bounds/responsive. Expo/mobile showed out-of-bounds feeling, so responsive layout and safe-area discipline need dedicated work.
3. GitHub versioning/checkpoints should resume; CI/CD via GitHub Actions is appropriate once the conditional reset blocker is fixed.

## Wave J recommendation

Wave J should focus on:

- fixing the reset Compose resolver issue,
- creating a GitHub checkpoint/CI path,
- expanding the app from one-page shell into lichess-like navigation/pages/dropdowns,
- auditing responsive web/mobile bounds,
- QA before push/PR.
