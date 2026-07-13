# Ticket 137 — Wave R Hosted-Fix Checkpoint PR and CI

Agent: Yuna (checkpoint/devops)
Wave: R-Hosted-Fix
Status: Blocked on Ticket 136 PASS

## Goal

Checkpoint Tickets 128 and 134–136 evidence plus the dictionary bootstrap/readiness fix on a dedicated branch, push it, and run PR CI. Do not merge, deploy, or mutate hosted data.

## Requirements

1. Include only intended source/tests/docs/tickets/responses.
2. Exclude all env files, credentials, generated outputs, DB dumps, and logs.
3. Run canonical gates, real-PostgreSQL bootstrap integration, secret scan, and diff checks.
4. Push `wave-r/preview-dictionary-bootstrap`.
5. Create PR to `main`; Athena/Yuna owns GitHub PR lifecycle using the now-shared approved `gh` config.
6. Monitor GitHub and Vercel checks to terminal status.
7. Stop before merge and request Ashar approval here.

## Post-merge gate

Even after merge, do not execute the hosted dictionary bootstrap until Ashar explicitly approves that preview data mutation in chat.
