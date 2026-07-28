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
| 180 | Yuna | Wave U Ready Reliability Checkpoint PR and CI | Complete; PR #11 merged as e81e211, main CI and Railway compatibility deploy PASS |
| 181 | Yuna | Hosted Wave U Concurrent-Ready Smoke | Complete — FAIL; reproducible simultaneous-ready HTTP 500/201 split, fail-closed void/no-contest; backend and web release blockers routed to Wave W |
| 182 | Jasmine | Final Hosted Wave U QA | Blocked on Wave W deploy and fresh Ticket 181 PASS |

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
| 192 | Luna | Non-Regressing Authoritative Clock and Readiness Phase | Complete; non-regressing clock/phase implementation verified |
| 193 | Jasmine | Final Frontend Clock/Phase Adversarial Recheck | Complete; PASS, no local Wave U release blocker remains |

## Wave V — Trusted Hosted V2 Activation

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 194 | Elisa | Railway Inventory-Proof and V2 Activation Runbook | Complete; operator-bound Railway proof and two-approval activation runbook delivered |
| 195 | Freya | Operator-Bound Railway Inventory Verifier | Complete; local provider-bound verifier/operator tooling verified and independent review PASS; no hosted operation performed |
| 196 | Jasmine | Trusted Activation Operator Independent QA | Complete; FAIL with four trusted-provider boundary blockers |
| 197 | Yuna | Wave V Activation Tooling Checkpoint PR and CI | Complete; PR #12 merged as 6992ce1, main CI and Railway deploy PASS |
| 198 | Yuna | Hosted Lifecycle V2 Activation Umbrella | Superseded by staged Tickets 202–204; do not send directly |
| 202 | Yuna | Read-Only Hosted V2 Activation Preflight | Complete — PASS from clean committed tooling at deployed `e91d515c`; one replica/lease, zero non-target leases/drain rows/writes, all readiness gates true |
| 203 | Yuna | Hosted V1 Close and Drain Proof | Complete — PASS; approved audited close applied, `closing_to_v2/2`, exact lease acknowledgement, zero v1 drain rows, Standard healthy |
| 204 | Yuna | Hosted V2 Open and Authority Proof | Complete — PASS; approved audited open applied, `v2_open/3`, exact lease acknowledgement, v2 public catalog active, zero post-open null/v1 rows |

## Wave V-Fix — Ticket 196 provider-boundary blockers

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 199 | Freya | Exact Railway Fleet Proof, Safe Command Serialization, and Public-Origin Fencing | Complete; all four provider-boundary blockers closed, canonical gates green, independent review PASS; no hosted operation performed |
| 200 | Jasmine | Focused Trusted-Provider Boundary Recheck | Complete; FAIL only on omitted RFC 8215 local-use NAT64 /48 |
| 201 | Jasmine | Final RFC 8215 NAT64 Origin-Fencing Recheck | Complete; PASS, all local Wave V release blockers closed |

## Wave V-Provider-Compatibility — Ticket 202 live-schema blocker

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 205 | Freya | Railway Live Status Schema Compatibility for Exact Fleet Proof | Complete; exact hosted-shape fixture and fail-closed implementation verified |
| 206 | Jasmine | Railway Live-Schema Fleet-Proof Independent QA | Complete; PASS |
| 207 | Yuna | Provider-Compatibility Checkpoint PR and CI | Complete; PR #13 merged as 0f67377, main CI and Railway deploy PASS; read-only preflight reached runtime blocker |

## Wave V-Runtime-Readiness — Hosted reconciler blocker

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 208 | Elisa | Hosted Reconciler Budget and Dependency-Minimal Architecture | Complete; dependency-minimal 10s pass/8s transaction architecture and backlog contract delivered |
| 209 | Jasmine | Reconciler Hosted-Latency Red Acceptance Matrix | Complete; exact Ticket 208 constants reconciled, 15-case permanent matrix has 10 intentional RED targets and 5 passing safety contracts |
| 210 | Freya | Hosted-Safe Reconciler Runtime Implementation | Complete; dependency-minimal 10s runtime, 11/10 sentinel batching, caught-up readiness, compiled operator smoke, hostile PostgreSQL proof, and independent review PASS; response: `responses/ticket-210-freya-hosted-safe-reconciler-runtime-implementation-response.md` |
| 211 | Jasmine | Hosted-Safe Reconciler Independent QA | Closed by Ticket 216 PASS; all runtime gates and final two-way ranked identity fencing independently verified |
| 212 | Yuna | Runtime-Readiness Checkpoint PR and CI | Complete; PR #14 merged as `28d360bc`, main CI and exact Railway deployment PASS |
| 213 | Freya | Close Ticket 211 Runtime Blockers | Complete; all architecture gates retained; Athena closed Ticket 214's sole direct-SQLSTATE classifier/test omission |
| 214 | Elisa | Pre-QA Reconciler Architecture and Source Gate | Closed; historical FAIL's sole classifier omission resolved by Ticket 215 PASS |
| 215 | Elisa | Final Direct SQLSTATE Reconciler Classifier Recheck | Complete — PASS; direct and nested SQLSTATEs, legacy mappings, sanitization, 43/43 focused gate, typecheck, and diff check verified |
| 216 | Jasmine | Final Two-Way Ranked Identity Recheck | Complete — PASS; all converse mismatches reject before dependent reads/writes, valid Standard/Speed routes remain separate, and unsupported precedence is preserved |

## Wave V-Operator-Closeout — Public readiness compatibility

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 217 | Jasmine | Operator Public-Readiness Compatibility Recheck | Closed by Ticket 219 PASS; public/legacy compatibility, DNS pinning, timeouts, and strict malformed-envelope fencing independently verified |
| 218 | Yuna | Operator Compatibility Checkpoint PR and CI | Complete; PR #15 merged as `e91d515c`, exact main CI and Railway deployment PASS |
| 219 | Jasmine | Final Strict Readiness Envelope Discriminator Recheck | Complete — PASS; exact one-own-branch discriminator and 27-case malformed matrix pass with sanitized failures |

## Wave W — Hosted v2 concurrent-ready remediation

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 220 | Elisa | Concurrent-Ready Hosted-Latency Architecture Gate | Complete — PASS architecture; deterministic RED classification completed by Ticket 221 |
| 221 | Freya | Hosted-Safe Simultaneous-Ready Backend Repair | Original hosted-latency `[500,201]` path repaired to `[201,201]`; Ticket 223 omitted backend recovery cases routed to Ticket 225 |
| 222 | Luna | Web/API Speed Truthfulness Repair | Initial authority repair complete; Ticket 223 omitted unavailable/schema/redirect cases routed to Ticket 226 |
| 223 | Jasmine | Wave W Independent Backend/Web QA | Complete — FAIL; two backend recovery and three web authority blockers independently reproduced; report preserved |
| 224 | Yuna | Wave W Checkpoint PR, CI, and Deploy Gate | Blocked on Ticket 227 PASS |

## Wave W-Fix — Ticket 223 omitted cases

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 225 | Freya | Ready Receipt/Recovery Omitted-Case Repair | Complete — PASS candidate; focused/hosted/timing/race/full API gates green |
| 226 | Luna | Strict Web Authority Contract and Redirect Repair | Complete — PASS candidate; strict schemas, redirect/origin fencing, truthful presentation and builds green |
| 227 | Jasmine | Final Wave W Omitted-Case Independent Recheck | Complete — PASS; backend/web independent lanes plus local production-browser proof green |
| 224 | Yuna | Wave W Checkpoint PR, CI, and Deploy Gate | Ready for one batched checkpoint PR; merge/deploy remain separately gated |
## Recommended order

Ticket 181 reproduced a release blocker at deployed `e91d515c`: simultaneous ready acknowledgements at 0.680ms dispatch skew returned HTTP 500/201 and only one ready persisted; the match safely voided/no-contest with no rating mutation. Public v2 remains open and healthy while remediation proceeds because the failure is fail-closed and a lifecycle disable/rollback is a separate mutation requiring approval. No further hosted gameplay is authorized.

1. **Now:** Ticket 224 creates one batched Wave W/W-Fix checkpoint PR from exact current `origin/main`.
2. **After final-head CI and independent diff review:** request one explicit merge approval.
3. **After approved merge/deployment:** verify exact deployed revision and public authority read-only.
4. **Then:** request a fresh narrow hosted-gameplay approval for Ticket 181 rerun.
5. **After Ticket 181 PASS:** send Ticket 182 for final independent hosted QA.

Ticket 223's valid historical FAIL is closed only by Tickets 225–227. Ticket 182 remains blocked. No further hosted gameplay, lifecycle transition, provider change, dictionary change, merge, or deployment is authorized yet.

## Persistent constraints

- Prefer free/open-source/local-first tooling.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets or create real `.env` files.
- Do not deploy, create external services, or configure production secrets without explicit Ashar approval.
- Preserve spoiler safety and server authority for gameplay/rating logic.
- Use branch + PR + GitHub Actions for checkpoints.
