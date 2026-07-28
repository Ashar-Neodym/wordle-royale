# Ticket 203 — Hosted V1 Close and Drain Proof Response

Task: Hosted V1 Close and Drain Proof
Agent: Athena (approved operations executor)
Status: PASS

## Approval provenance

Ashar explicitly approved Ticket 203 for Railway deployment `ce812cf4-967a-4457-afe1-07a21d50eefb`, artifact `git:e91d515c730f10c3d97d69627a497f810ad3c465`, one replica, generation 1, and `v1_open -> closing_to_v2` only.

## Pre-mutation proof

Clean committed operator worktree at exact artifact, zero tracked changes. Immediate dry-run PASS: one provider replica, one matching lease, zero non-target leases, `v1_open/1`, all schema/dictionary/reconciler/Standard gates true, zero eligible v1 drain rows.

## Applied transition

Exactly one `close-v2 --apply` operation used confirmation `CLOSE SPEED V1 CREATION FOR V2 DRAIN` and approval reference `discord-approval-a-ticket-203-2026-07-27`. Result PASS. No open command followed.

## Post-close proof

- authority: `closing_to_v2`, generation `2`
- active creation version: null
- target release/deployment/artifact: exact match
- expected/provider/fresh/distinct replicas: 1
- non-target leases: 0
- all fresh leases observed generation 2: true
- eligible v1 queued drain rows: 0
- activation audits: 1
- audit operation/result: `close-v2` / `applied`
- audit transition: `v1_open/1 -> closing_to_v2/2`
- audit approval/deployment/artifact: exact matches
- audit failure: null
- public `/readyz`: HTTP 200 `ok`
- Standard catalog: enabled
- Speed queue: disabled with `lifecycle_activation_draining`
- existing Speed matches remain supported

## Safety

No v2 open, provider/environment change, dictionary mutation, deployment, queue rewrite/delete, gameplay smoke, disable, rollback, or unrelated database write occurred. Ticket 204 remains blocked on explicit Approval B.
