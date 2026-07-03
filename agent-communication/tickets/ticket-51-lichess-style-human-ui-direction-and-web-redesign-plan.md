# Ticket 51 — lichess-style-human-ui-direction-and-web-redesign-plan

Assigned agent: Luna
Priority: Critical
Wave: H — Lichess-style UI reset and complete ranked loop
Dependencies: None. This should run before major web visual implementation.
Parallelization: H.0 first; can run while backend Tickets 52/53 start if they avoid UI decisions.
Human action needed: Optional: Ashar should review the resulting screenshots/notes before large UI polish continues.

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

Create a concrete web UI direction reset based on Ashar's feedback.

Deliverables:

1. Audit the current web UI and identify what feels AI-generated/SaaS-like.
2. Define a lichess-inspired Wordle Royale style direction: layout, spacing, colors, typography, navigation, lobby list, board area, rating/profile affordances.
3. Produce a short design note under `docs/` with do/don't rules that future Luna/Jasmine work can use.
4. Implement a small first pass if safe: reduce obvious AI/SaaS styling, make the homepage more game-first, calmer, and more human.
5. If running the web app locally, capture or describe before/after evidence. If screenshots are possible, save them under docs or agent-communication artifacts.

Important: this is not about copying lichess branding. It is about adopting the same human, minimal, game-first product feel.

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
pnpm --filter @wordle-royale/web build
pnpm build
```

## Response path

`agent-communication/responses/ticket-51-lichess-style-human-ui-direction-and-web-redesign-plan-response.md`

Do not answer only in chat. Write the Markdown response file.
