# Ticket 208 — Hosted Reconciler Budget and Dependency-Minimal Architecture

Agent: Elisa (architecture)
Wave: V-Runtime-Readiness
Status: Complete

## Goal

Design a bounded, fail-closed reconciler health contract that can succeed over the measured hosted Railway→Supabase path without weakening expiry correctness.

## Required decisions

- Remove redundant per-pass database/schema/dictionary readiness work when safe; identify the minimum transaction/query proof required for expiry.
- Set explicit pass, transaction, max-wait, success-freshness, and scheduling budgets from hosted evidence while keeping no overlap, epoch/generation fencing, bounded failure detection, and deterministic maximum expiry lateness.
- Preserve 90s invitation, first-ack 20s ready, 3s countdown, 75s round, exactly-once settlement, Standard isolation, and fail-closed activation.
- Specify startup, transient latency, hung query, failed transaction, obsolete completion, empty queue, backlog, and deployment-restart behavior.
- Include exact acceptance constants, tests, observability, rollback, and hosted verification steps.

No implementation, hosted access, provider mutation, deployment, lifecycle transition, or database write.

## Outputs

- `docs/2026-07-23-hosted-reconciler-budget-dependency-minimal-architecture.md`
- `agent-communication/responses/ticket-208-elisa-hosted-reconciler-budget-dependency-minimal-architecture-response.md`

## Completion note

Delivered the dependency-minimal expiry-worker boundary, fixed `10,000ms` pass and `8,000ms` transaction budgets, batch/sentinel backlog policy, deterministic lateness bounds, failure/restart fencing, observability, and Tickets 209–212 handoffs. No implementation or hosted action occurred.
