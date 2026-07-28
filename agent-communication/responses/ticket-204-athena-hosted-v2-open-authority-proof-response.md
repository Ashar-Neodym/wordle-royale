# Ticket 204 — Hosted V2 Open and Authority Proof Response

Task: Hosted V2 Open and Authority Proof
Agent: Athena (approved operations executor)
Status: PASS

## Approval provenance

Ashar explicitly approved Ticket 204 for Railway deployment `ce812cf4-967a-4457-afe1-07a21d50eefb`, artifact `git:e91d515c730f10c3d97d69627a497f810ad3c465`, one replica, closing generation 2, and `closing_to_v2 -> v2_open` only while every runbook gate remained PASS.

## Pre-open proof

Clean committed operator worktree at exact artifact, zero tracked changes. Immediate dry-run PASS: one provider replica, one matching lease, zero non-target leases, `closing_to_v2/2`, schema/dictionary/reconciler/Standard true, zero eligible v1 drain rows.

## Applied transition

Exactly one `open-v2 --apply` operation used confirmation `OPEN SPEED CREATION ON READY LIFECYCLE V2` and approval reference `discord-approval-b-ticket-204-2026-07-27`. Result PASS. No gameplay followed.

## Post-open proof

- authority: `v2_open`, generation `3`
- active creation version: `speed_ready_v2_first_ack_90s`
- target release/deployment/artifact: exact match
- expected/provider/fresh/distinct replicas: 1
- non-target leases: 0
- all fresh leases observed generation 3: true
- provider/operator dry-run: PASS
- activation audits: 2, both applied, no failures
- transitions: `v1_open/1 -> closing_to_v2/2`; `closing_to_v2/2 -> v2_open/3`
- post-open null/v1 Speed tickets: 0
- post-open null/v1 Speed matches: 0
- `/readyz`: HTTP 200 ok; activation and runtime ok
- Standard: enabled
- Speed: enabled, queue enabled
- public ready lifecycle: `speed_ready_v2_first_ack_90s`
- invitation/ready contract: 90s invitation, 20s first-valid-ack window

## Safety

No provider/environment change, dictionary mutation, deployment, gameplay smoke, disable, rollback, or unrelated database write occurred. Ticket 181 remains blocked on separate hosted gameplay-write approval. Ticket 182 remains blocked on Ticket 181 PASS.
