# Ticket 128 — Hosted Preview Wave R Deploy and Smoke

Agent: Yuna (devops/deploy)
Wave: R — Live Standard 1v1 Matchmaking
Status: New after Ticket 127 green CI, Ashar merge approval, Athena/Yuna merge, and green post-merge main CI

## Goal

Verify the merged Wave R migration/deployment and run non-secret hosted two-user queue smoke.

## Requirements

- Confirm merged SHA and green post-merge `main` CI.
- Confirm Railway pre-deploy migration command executes successfully or has no pending migrations; capture non-secret provider evidence when accessible.
- Verify `/readyz` database and application schema status.
- Create two separate preview demo sessions with separate cookie jars.
- Join both to `standard_1v1`; verify one shared match ID and distinct participants.
- Verify queue status/reconnect and matched gameplay route.
- Complete or safely exercise the rating-settlement smoke path without fabricating evidence.
- Verify web queue UX and existing core endpoints.
- Record rollback instructions.

## Safety

No destructive schema rollback, paid resource, secret exposure, or provider-setting change without explicit Ashar approval.
