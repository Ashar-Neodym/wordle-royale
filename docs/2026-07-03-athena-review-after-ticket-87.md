# Athena review after Ticket 87 — Wave L preview readiness

Date: 2026-07-03
Owner: Athena
Scope: Review completed responses through Ticket 87 and set Wave M direction.

## Short summary

Wave L made strong local progress toward public-preview readiness:

- Auth/deployment boundary is now explicit: local/test can use fixture users; preview/prod must require a session and must not silently impersonate local stub users.
- API current-user/write paths now reject preview unauthenticated access with `not_authenticated` instead of returning fake users or stub tokens.
- Completed ranked results now expose spoiler-safe `resultActions` for share/rematch/next-action UI.
- Web preview surfaces now show honest auth-limited states and safe invite/share copy.
- Mobile has repeatable LAN/Expo Go instructions and machine-verified local/LAN API adapter evidence, but physical-phone smoke remains deferred.

## Verification performed by Athena

Working tree inspected at:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Git state at review time:

```text
branch: wave-l/preview-readiness
remote branch: origin/wave-l/preview-readiness
remote head: 01b15194de3dd45c582fb98dd209968a01099a3a
main head: 4734c7a008d23e4bd3ed938576a0d3de28160cb3
```

Response files present for Tickets 80–87.

Local verification commands run by Athena and passed:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm secret-scan
git diff --check origin/main...HEAD
git diff --check
pnpm lint
pnpm typecheck
pnpm --filter @wordle-royale/api test
pnpm smoke:local
pnpm deps:check
```

Key output:

- Workspace scaffold validation passed.
- API tests passed: 40/40.
- Web/mobile/API/package builds passed.
- Secret scan passed: 185 source/config files scanned.
- Local smoke passed.
- Local dependency check passed.
- Diff whitespace checks passed.

## GitHub / checkpoint status

Important: Wave L is **not merged to main** and no GitHub PR currently exists for `wave-l/preview-readiness`.

Unauthenticated GitHub API check returned no PRs for:

```text
head=Ashar-Neodym:wave-l/preview-readiness
base=main
```

Recent GitHub Actions only show the previous Wave K/main run. Because the workflow triggers on PRs and main pushes, Wave L has not received remote PR CI yet.

## Decision

Wave L should be treated as locally verified but checkpoint-blocked:

- Local code/test quality: PASS.
- Spoiler/auth safety: PASS based on Jasmine and Athena checks.
- Remote PR/CI: BLOCKED until a PR is created.
- Public API preview deployment readiness: BLOCKED until API production build/start shape exists.
- Mobile physical-device smoke: WARN / deferred.

## Wave M direction

Wave M should focus on turning Wave L into a real preview checkpoint and deploy-shaped candidate, without deploying or creating paid/external resources yet:

1. create/monitor the Wave L PR and remote CI;
2. add API production build/start smoke;
3. add preview env/deploy-shape checks to CI;
4. decide the minimal Preview MVP account/session path;
5. optionally implement a small first-party session slice only if approved by the architecture decision;
6. close physical mobile smoke if Ashar can test Expo Go;
7. run independent QA and recommend whether a real preview deployment should be approved.
