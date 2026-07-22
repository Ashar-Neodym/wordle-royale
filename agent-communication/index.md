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
| 118 | Yuna | Railway Pre-Deploy Migration Command | Complete; configured manually by Ashar |
| 119 | Yuna | Wave Q Checkpoint PR and CI Monitor | Complete; PR #5 merged as `b4135e1`, main CI passed |
| 120 | Yuna | Hosted Preview Wave Q Deploy and Smoke | Complete; hosted runtime smoke passed |
| 121 | Jasmine | QA Review Wave Q Follow-Up and Hosted Preview | Complete; PASS with non-blocking Railway log warning |

## Wave R — Live Standard 1v1 Matchmaking

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 122 | Elisa | Standard 1v1 Queue Contract and Persistence Decision | Complete; Athena reviewed decision lock |
| 123 | Freya | Database-Backed Standard 1v1 Queue and Matchmaker | Complete; Athena verified migration/build/tests |
| 124 | Ruby | Standard 1v1 Rating Settlement Activation | Complete; Athena verified focused settlement tests |
| 125 | Luna | Live Standard 1v1 Queue UX | Complete; reconnect blocker fixed by 132 and verified by 133 |
| 126 | Jasmine | Wave R Standard Queue Integration QA | Complete; original FAIL superseded by Ticket 133 PASS |
| 127 | Yuna | Wave R Checkpoint PR and CI | Complete; PR #6 merged, post-merge main CI passed |
| 128 | Yuna | Hosted Preview Wave R Deploy and Smoke | Complete; PASS after PR #8 deployment |
| 129 | Jasmine | Final Hosted Wave R QA | Complete; PASS with two non-blocking web warnings |

## Wave R-Fix — Ticket 126 blocker remediation

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 130 | Freya | Retry Concurrent Cold-Profile Queue Joins | Complete; Athena verified real-Postgres serialization recovery |
| 131 | Ruby | Authoritative Standard Rating Read Models | Complete; Athena verified real-Postgres read convergence |
| 132 | Luna | Bounded Standard Queue Reconnect UX | Complete; Athena verified focused state tests and web build |
| 133 | Jasmine | Focused Wave R Blocker Recheck | Complete; PASS, all three Ticket 126 blockers cleared |

## Wave R-Hosted-Fix — Ticket 128 dictionary bootstrap blocker

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 134 | Elisa | Preview Dictionary Bootstrap and Readiness Contract | Complete; preview-only policy locked |
| 135 | Freya | Dictionary-Only Preview Bootstrap and Operational Readiness | Complete; Athena verified full gates and fresh PostgreSQL harness |
| 136 | Jasmine | Preview Dictionary Bootstrap Independent QA | Complete; PASS; false hosted-approval claim corrected by Athena |
| 137 | Yuna | Wave R Hosted-Fix Checkpoint PR and CI | Complete; PR #7 merged, main CI passed, bootstrap applied and readiness ok |

## Wave R-Hosted-Timeout-Fix — Ticket 128 transaction blocker

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 138 | Freya | Hosted Matchmaking Transaction Budget | Complete; 20-second budget works, but Ticket 139 found two contract blockers |
| 139 | Jasmine | Matchmaking Transaction Budget Independent QA | Complete; FAIL on inner P2028 mapping and browser/server deadline ordering |
| 140 | Yuna | Wave R Hosted Timeout-Fix Checkpoint PR and CI | Complete; PR #8 merged and main CI passed |

## Wave R-Hosted-Timeout-Recheck — Ticket 139 blocker remediation

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 141 | Freya | Preserve Inner Transaction Expiry Semantics | Complete; Ticket 143 confirmed original P2028 blocker fixed |
| 142 | Luna | Correct Cross-Layer Matchmaking Deadlines | Complete; original ordering fixed, but complete-path budget remains unresolved |
| 143 | Jasmine | Focused Transaction Timeout Contract Recheck | Complete; FAIL on PostgreSQL retry flake and second-loop lifecycle budget |

## Wave R-Hosted-Lifecycle-Fix — Ticket 143 blocker remediation

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 144 | Elisa | Complete Matchmaking Lifecycle Budget and Retry Contract | Complete; 90-second lifecycle and shared four-attempt contract locked |
| 145 | Freya | Stable Concurrent Retry and Shared Lifecycle Budget | Complete; 10/10 delayed fresh-schema PostgreSQL runs passed |
| 146 | Luna | Bind Web Deadlines to Complete Matchmaking Lifecycle | Complete; 90/95/100/110-second policy verified |
| 147 | Jasmine | Final Local Matchmaking Lifecycle Recheck | Complete; PASS including 10/10 fresh-schema runs |

## Wave S — Hosted Reliability Polish

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 148 | Luna | Hosted Server-Read Reliability and Retry UX | Complete; Ticket 150 found two UX/truthfulness blockers |
| 149 | Luna | Favicon and Application Metadata Polish | Complete; Ticket 150 verified PASS |
| 150 | Jasmine | Wave S Reliability Polish Independent QA | Complete; FAIL on inert retry links and unrelated Alice fallback |
| 151 | Yuna | Wave S Reliability Checkpoint PR and CI | Complete; PR #9 merged and main CI passed |
| 152 | Yuna | Hosted Wave S Reliability Smoke | Complete; PASS with Railway revision observability warning |
| 153 | Jasmine | Final Hosted Wave S QA | Complete; PASS with no blockers |

## Wave S-Fix — Ticket 150 blocker remediation

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 154 | Luna | Real Server-Read Retry Controls | Complete; Ticket 156 verified PASS |
| 155 | Luna | Remove Unrelated Fixture Identity from Live Failure States | Complete; Ticket 156 verified PASS |
| 156 | Jasmine | Focused Wave S Blocker Recheck | Complete; PASS |

## Wave T — Live Speed/Blitz Ranked 1v1

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 157 | Elisa | Live Speed/Blitz 1v1 Contract | Complete; Ashar approved 75s/20s/3s/100ms Speed v1 constants |
| 158 | Freya | Server-Authoritative Speed Queue and Gameplay | Complete; independently verified, remains fail-closed |
| 159 | Ruby | Speed Rating Settlement and Read Models | Complete; independently verified including fresh-PostgreSQL convergence |
| 160 | Luna | Live Speed Queue and Countdown UX | Complete; Ticket 161 found one mutation-correlation blocker |
| 161 | Jasmine | Wave T Speed Integration QA | Complete; FAIL with four release blockers |
| 162 | Yuna | Wave T Speed Checkpoint PR and CI | Complete; PR #10 open, latest head checks green, merge approval required |
| 163 | Yuna | Hosted Wave T Speed Deploy and Smoke | Complete; PASS with hosted concurrent-ready latency warning |
| 164 | Jasmine | Final Hosted Wave T Speed QA | Complete; FAIL, simultaneous ready cannot reliably beat current 20s-from-match-creation deadline |
| 165 | Yuna | Railway Revision Observability | Backlog; non-blocking |

## Wave T-Fix — Ticket 161 release blockers

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 166 | Freya | Fail-Closed Speed Catalog and Locked Identity | Complete; operational catalog and all Speed paths fail closed |
| 167 | Freya | Viewer Guess Operation Correlation | Complete; durable participant-scoped operation IDs verified across repeated words/reconnect |
| 168 | Luna | Preserve Uncertain Repeated-Word Guess Identity | Complete; production browser retry identity verified by Ticket 171 |
| 169 | Ruby | Immutable Speed Completion Identity on Reads | Complete; persisted identity and repeated-read convergence verified |
| 170 | Freya | Deterministic PostgreSQL Speed Timing Proof | Complete; deterministic fresh-schema PostgreSQL proof passed 4/4 |
| 171 | Jasmine | Focused Wave T Release-Blocker Recheck | Complete; FAIL on unbounded hung-reconciler health, remediated by Ticket 172 |
| 172 | Freya | Bounded Freshness-Aware Speed Reconciler Health | Complete; stale/hung detection works, but Ticket 173 found obsolete completion revival |
| 173 | Jasmine | Final Reconciler Health Focused Recheck | Complete; FAIL on missing scheduler/pass generation fence |
| 174 | Freya | Generation-Fenced Speed Reconciler Completion | Complete; epoch/pass fencing and late success/failure rejection independently reviewed PASS |
| 175 | Jasmine | Adversarial Reconciler Generation-Fence Recheck | Complete; PASS, no release blocker remains |

## Wave U — Hosted Speed Ready Reliability

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 176 | Elisa | Hosted Speed Ready Lifecycle Contract | Complete; Ashar approved 90s invitation plus first-ack 20s ready lifecycle v2 |
| 177 | Freya | Server-Authoritative Hosted Ready Lifecycle | Complete; Ticket 179 found readiness/race/activation blockers |
| 178 | Luna | Hosted-Latency Speed Mutation Budgets and Recovery UX | Complete; Ticket 179 found four recovery truthfulness blockers |
| 179 | Jasmine | Wave U Ready Reliability Integration QA | Complete; FAIL with seven release blockers |
| 180 | Yuna | Wave U Ready Reliability Checkpoint PR and CI | Blocked on Ticket 193 PASS |
| 181 | Yuna | Hosted Wave U Concurrent-Ready Smoke | Blocked on approved 180 merge/main CI |
| 182 | Jasmine | Final Hosted Wave U QA | Blocked on 181 PASS |

## Wave U-Fix — Ticket 179 release blockers

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 183 | Luna | Truthful Speed Mutation Recovery and Snapshot Ordering | Complete; Ticket 188 found two remaining monotonic/deadline-proof defects |
| 184 | Freya | Schema-Isolated Complete Speed Lifecycle Readiness | Complete; exact active-schema lifecycle/readiness contract and disposable mutation matrix PASS |
| 185 | Freya | Deterministic Hostile Speed Lifecycle Race Matrix | Complete; deterministic PostgreSQL lock/barrier matrix PASS across 10 fresh schemas (70/70) |
| 186 | Elisa | Mixed-Version Speed Lifecycle Activation Contract | Complete; shared DB gate/two-phase activation contract delivered |
| 187 | Freya | Fail-Closed Mixed-Version Lifecycle Activation Gate | Complete; fail-closed DB authority/capability gate and 10-schema mixed-version matrix PASS (60/60), no hosted activation |
| 188 | Jasmine | Focused Wave U Release-Blocker Recheck | Complete; FAIL with three narrow blockers |

## Wave U-Fix-2 — Ticket 188 blockers

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 189 | Luna | Monotonic Speed Snapshot and Current Retry-Deadline Proof | Complete; Ticket 191 found two remaining clock/phase defects |
| 190 | Freya | Exact Activation Index Collation and Opclass Readiness | Complete; Ticket 191 independently PASS |
| 191 | Jasmine | Focused Ticket 188 Blocker Recheck | Complete; FAIL with two frontend blockers |

## Wave U-Fix-3 — Ticket 191 blockers

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 192 | Luna | Non-Regressing Authoritative Clock and Readiness Phase | Ready now |
| 193 | Jasmine | Final Frontend Clock/Phase Adversarial Recheck | Blocked on 192 |

## Recommended order

Wave T is merged and hosted. Wave U v2 remains local/unmerged. Ticket 191 closed the activation-index blocker and most frontend cases, but found two final frontend ordering defects; Ticket 180 is blocked.

Wave U-Fix-3 execution:

1. Now: 192 (Luna preserves non-regressing authoritative time and readiness phase).
2. After 192: 193 (Jasmine focused adversarial recheck).
3. Only after 193 PASS: 180 (Yuna checkpoint PR/CI; no merge).
4. Approval gate: Ashar approves merge; Athena monitors main CI/deployment and any separately authorized activation operation.
5. Then 181 hosted simultaneous-ready smoke and 182 final hosted QA.

Current hosted Speed remains Wave T/v1; unmerged Wave U defects are not deployed. Ticket 165 remains optional operational backlog.

## Persistent constraints

- Prefer free/open-source/local-first tooling.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets or create real `.env` files.
- Do not deploy, create external services, or configure production secrets without explicit Ashar approval.
- Preserve spoiler safety and server authority for gameplay/rating logic.
- Use branch + PR + GitHub Actions for checkpoints.
