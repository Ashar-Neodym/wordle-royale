# Ticket 56 — mobile-live-lobby-preview-and-readiness-smoke

Assigned agent: Luna
Priority: Medium
Wave: H — Lichess-style UI reset and complete ranked loop
Dependencies: After Ticket 46; ideally after Ticket 53 if leaderboard/read endpoints are stable.
Parallelization: Can run in H.2 parallel with web UI if Luna has capacity; otherwise defer.
Human action needed: Optional phone action: if Luna asks, Ashar may need to scan Expo Go QR and report what the readiness/live preview card shows. Fallback: complete build/config checks and mark phone smoke deferred.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-29-athena-review-after-tickets-44-50.md`
- `agent-communication/index.md`
- Relevant Wave G responses in `agent-communication/responses/`

Important product correction from Ashar:

> The current UI looks too AI-generated. The desired direction is like lichess: human, calm, functional, game-first, minimal, readable, and community/rating oriented.

Do **not** continue the glossy AI/SaaS dashboard style.

## Task

Extend mobile from readiness-only toward a small live read-only preview.

Deliverables:

1. Use the mobile API adapter to show a read-only live lobby preview or leaderboard/rating preview if endpoints are available.
2. Keep fixture/demo fallback clearly labeled.
3. Do not implement mobile guess gameplay yet unless the API/state contract is stable and scope remains small.
4. Provide exact Expo Go instructions for Ashar if real-phone verification is needed.
5. Keep mobile UI calm and game-like, not SaaS-dashboard-like.

## Constraints

- Prefer free/open-source/local-first tooling.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets or create real `.env` files.
- Do not push to GitHub.
- Keep changes focused to this ticket's scope.
- Preserve spoiler safety: never expose plaintext answers before allowed match completion.
- If you use Docker deps, prefer the normalized repo commands:

```bash
pnpm deps:check
pnpm deps:up
pnpm deps:down
```

## Acceptance criteria

- Complete the requested deliverable or clearly mark it blocked with actionable details.
- Run the most relevant verification commands.
- Separate blockers from warnings.
- List files changed.
- Write your response to the exact response path below.

## Recommended verification

```bash
pnpm --filter @wordle-royale/mobile build
pnpm --filter @wordle-royale/mobile exec expo config --type public
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-56-mobile-live-lobby-preview-and-readiness-smoke-response.md`

Do not answer only in chat. Write the Markdown response file.
