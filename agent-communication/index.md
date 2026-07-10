# Wordle Royale — Ticket Index

## Current status

Wave O hosted preview is live on Vercel + Railway + Supabase after Ashar-approved provider setup and Supabase migration deployment. Independent QA initially found missing-migration 500s; Athena applied the approved preview DB migration and rechecked web/API smoke successfully.

Current review doc:

`docs/2026-07-09-athena-hosted-preview-and-chess-ranked-direction.md`

## Product direction

Ashar's vision: Wordle Royale should be for Wordle what chess.com / lichess are for chess — competitive, social, ranked, replayable, multi-page, and rating-driven with Elo/MMR as a core loop.

## Visual/product correction

UI should stay human, calm, functional, minimal, game-first, rating/community oriented — closer to lichess than a glossy AI/SaaS dashboard. Continue adding real product depth, not decorative pages.

## Completed checkpoint

Tickets 01–102 are complete through Wave N. PR #4 merged to `main` and GitHub Actions passed on the merge commit.

## Wave L — Public-preview readiness

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 80 | Elisa | Preview MVP Auth, Account, and Deployment Boundary | Complete |
| 81 | Yuna | Preview Deployment, CI, and Environment Plan | Complete |
| 82 | Freya | Preview Session and Current User Slice | Complete |
| 83 | Ruby | Player-Facing Ranked Loop Polish: Rematch, Share, and Result Actions | Complete |
| 84 | Luna | Web Preview Polish: Result Actions, Invite/Share, and Auth-Aware Empty States | Complete |
| 85 | Luna | Mobile Expo Real-Device Smoke Closure and Preview UX Polish | Complete with physical-device caveat |
| 86 | Yuna | Wave L Checkpoint PR and Main CI Monitor | Branch pushed; PR creation blocked/not completed |
| 87 | Jasmine | QA Review Wave L Preview Readiness | Complete; FAIL/BLOCKED for preview checkpoint due no PR/remote CI and API deploy-start gap |

## Wave M — Preview deploy-shape and checkpoint unblock

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 88 | Yuna | Wave L PR/CI Unblock and Remote Checkpoint | Complete; PR #2 merged and post-merge CI passed |
| 89 | Elisa | Preview MVP Account/Session Decision Lock | Complete; explicit preview demo-session recommended |
| 90 | Freya | API Production Build/Start Shape and Smoke | Complete; Athena verified prod-start smoke |
| 91 | Yuna | Preview Deploy-Shape CI Gate | Complete; Athena verified local prod-start smoke |
| 92 | Freya | Minimal Preview Session Slice — Conditional Implementation | Complete; explicit preview demo session implemented |
| 93 | Luna | Web Preview Session UX and Deploy-Ready States | Complete; explicit preview demo UX wired |
| 94 | Luna | Mobile Expo Physical Smoke and Preview Config Closure | Complete with physical-device caveat deferred |
| 95 | Yuna | Wave M Checkpoint Branch, PR, and CI Monitor | Complete; PR #3 open and remote CI passed after Athena fix |
| 96 | Jasmine | QA Review Wave M Preview Deploy Approval | Complete; PASS WITH WARNINGS; approves controlled Wave N setup after Ashar approval |

## Wave N — Controlled public-preview deployment setup

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 97 | Elisa | Controlled Preview Deployment Scope Decision Lock | Complete; web + hosted API demo-only preview scope locked |
| 98 | Yuna | Preview Infrastructure and Environment Runbook | Complete; plan-only env/runbook produced |
| 99 | Freya | Hosted API Preview Hardening | Complete; Athena verified hosted config/CORS/cookie/readiness hardening |
| 100 | Luna | Preview Release Copy and Mobile Physical-Smoke Closure | Complete with physical-device caveat deferred |
| 101 | Yuna | Wave N Checkpoint Branch, PR, and CI Monitor | Complete; PR #4 open and remote CI passed after Athena PR creation |
| 102 | Jasmine | QA Review Wave N Preview Deploy Setup | Complete; initial FAIL fixed; 102b PASS WITH WARNINGS; PR #4 may proceed to merge approval |

## Wave O — Controlled hosted-preview provisioning/deployment

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 103 | Elisa | Preview Provider Final Decision and Approval Gate | Complete; Vercel web, Supabase Postgres first, Neon fallback, separate long-running API server |
| 104 | Yuna | Preview Provisioning Preflight Checklist | Complete; preflight revised around Vercel + Supabase + separate API host |
| 105 | Yuna | Controlled Preview Provisioning | Complete; Supabase + Railway API + Vercel web live after manual provider setup |
| 106 | Freya | Hosted API Deploy and Smoke | Complete; API URL live, `/healthz` and `/readyz` pass |
| 107 | Luna | Hosted Web Preview Smoke | Complete; Vercel web live and demo session smoke passes after migration fix |
| 108 | Yuna | Wave O Checkpoint PR/CI/Deploy Evidence | Complete; response written with provider/deploy evidence |
| 109 | Jasmine | QA Review Wave O Hosted Preview | Complete; PASS WITH WARNINGS after missing migration fix |

## Wave P — Chess-style ranked Wordle foundation

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 110 | Elisa | Chess-Style Ranked System Contract | Complete; contract doc created |
| 111 | Ruby | Rating Algorithm Simulation and Mode Ladders | Complete; Glicko-style baseline recommended |
| 112 | Freya | Mode-Aware Rating Profile Foundation | Complete; schema/contracts/read models updated |
| 113 | Luna | Chess-Style Profile and Ranked Mode UI | Complete with QA warnings |
| 114 | Yuna | Hosted Preview Migration/Readiness Hardening | Complete; runbook/recommendation created |
| 115 | Jasmine | QA Review Wave P Chess-Style Ranked Foundation | Complete; CONDITIONAL PASS with follow-ups |

## Wave Q — Wave P QA follow-up and deploy hardening

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 116 | Luna | Profile Mode Card Accuracy Fix | Complete; Athena verified web build |
| 117 | Freya | Schema-Aware Readiness Check | Complete; Athena verified API tests/build |
| 118 | Yuna | Railway Pre-Deploy Migration Command | Complete by Ashar in Railway dashboard; execution evidence pending next deploy |
| 119 | Yuna | Wave Q Checkpoint PR and CI Monitor | Branch pushed; PR creation blocked by unauthenticated GitHub API/browser |
| 120 | Yuna | Hosted Preview Wave Q Deploy and Smoke | Blocked until PR CI + merge approval |
| 121 | Jasmine | QA Review Wave Q Follow-Up and Hosted Preview | New after 116–120 |

## Recommended order

Wave Q status: 116/117 are complete and verified; 118 is blocked from live provider change because the worker shell lacks Railway access. Proceed with checkpointing 116/117 plus the documented 118 block, unless Ashar applies the Railway dashboard setting first.

Wave Q recommended execution:

1. Optional manual gate: Ashar can set Railway API pre-deploy command from Ticket 118 dashboard instructions.
2. Q.1 now: 119 (Yuna PR/CI checkpoint) — include 116/117 fixes and 118 blocked evidence.
3. Q.2 after PR merge approval/provider migration decision: 120 (Yuna hosted deploy/migration smoke).
4. Q.3 after deploy: 121 (Jasmine independent QA).

## Persistent constraints

- Prefer free/open-source/local-first tooling.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets or create real `.env` files.
- Do not deploy, create external services, or configure production secrets without explicit Ashar approval.
- Preserve spoiler safety and server authority for gameplay/rating logic.
- Use branch + PR + GitHub Actions for checkpoints.
