# Wordle Royale — Ticket Index

## Current status

Wave M / PR #3 is merged to `main` and post-merge GitHub Actions passed. Wave N ticket wave is ready for controlled public-preview deployment setup.

Current review doc:

`docs/2026-07-07-athena-review-after-ticket-101.md`

## Product direction

Ashar's vision: Wordle Royale should be for Wordle what chess.com / lichess are for chess — competitive, social, ranked, replayable, multi-page, and rating-driven with Elo/MMR as a core loop.

## Visual/product correction

UI should stay human, calm, functional, minimal, game-first, rating/community oriented — closer to lichess than a glossy AI/SaaS dashboard. Continue adding real product depth, not decorative pages.

## Completed checkpoint

Tickets 01–96 are complete through Wave M. PR #3 merged to `main` and GitHub Actions passed on the merge commit.

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
| 102 | Jasmine | QA Review Wave N Preview Deploy Setup | New; N.3 QA after 101 |

## Recommended order

1. N.0: Ticket 97 and Ticket 98 can start together; 98 should mark assumptions until 97 lands.
2. N.1: Ticket 99 and Ticket 100 can run after/alongside 97's decision, with no deployment or secrets.
3. N.2: Ticket 101 checkpoint PR/CI after 97–100.
4. N.3: Ticket 102 QA last, then Athena asks Ashar before any real provider provisioning/deployment.

## Persistent constraints

- Prefer free/open-source/local-first tooling.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets or create real `.env` files.
- Do not deploy, create external services, or configure production secrets without explicit Ashar approval.
- Preserve spoiler safety and server authority for gameplay/rating logic.
- Use branch + PR + GitHub Actions for checkpoints.
