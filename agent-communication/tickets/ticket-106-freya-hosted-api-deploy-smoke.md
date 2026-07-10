# Ticket 106 — Hosted API Deploy and Smoke

Agent: Freya (backend)
Wave: O — Controlled preview provisioning/deployment
Status: Blocked until Ticket 105 provides preview API URL/env state

## Task

Validate the hosted preview API after provisioning.

## Scope

- Verify `/healthz` and `/readyz` on the hosted API origin.
- Verify preview demo session start/auth cookie/CORS from approved web origin.
- Verify DB connectivity and Redis optional behavior.
- Verify no dev auth/routes are enabled.
- Document any provider-specific runtime issue.

## Output

Write response to:

`agent-communication/responses/ticket-106-freya-hosted-api-deploy-smoke-response.md`
