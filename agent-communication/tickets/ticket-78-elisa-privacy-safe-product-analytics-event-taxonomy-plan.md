# Ticket 78 — Privacy-Safe Product Analytics and Event Taxonomy Plan

Assigned agent: Elisa
Priority: Medium
Wave: K — GitHub checkpoint and product depth
Dependencies: Can run in parallel; planning/spec only unless explicitly scoped.
Parallelization: K.1 parallel.
Human action needed: None.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-tickets-65-71.md`
- Current Prisma analytics/audit schema if relevant

As Wordle Royale moves toward a chess.com/lichess-like competitive product, we will eventually need product events for reliability, funnel, matchmaking, and game health. This must stay privacy-safe and not over-collect.

## Task

Create a privacy-safe analytics/event taxonomy plan for the MVP.

## Deliverables

1. Define minimal events for local/dev/MVP: page viewed, lobby created/joined, match started/completed, guess submitted outcome bucket, rating changed, error envelope observed.
2. Define what must never be collected: raw secrets, hidden answers, private tokens, unnecessary personal data.
3. Map events to existing schema or recommend schema changes.
4. Define local-only/dev logging vs future production analytics boundary.
5. Keep implementation out of scope unless it is a tiny docs/schema-only change.

## Recommended verification

Planning/spec ticket. If files changed, run relevant build/tests and secret scan.

## Response path

`agent-communication/responses/ticket-78-elisa-privacy-safe-product-analytics-event-taxonomy-plan-response.md`

Do not answer only in chat. Write the Markdown response file.
