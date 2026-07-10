# Ticket 104 — Preview Provisioning Preflight Checklist

Agent: Yuna (devops)
Wave: O — Controlled preview provisioning/deployment
Status: New

## Context

Run after/alongside Ticket 103. No provisioning until Ashar explicitly approves providers/resources/secrets.

## Task

Create a concrete, step-by-step provisioning preflight for the selected/assumed providers.

## Scope

- List exact provider UI/CLI steps that will be performed after approval.
- List exact env vars/secrets to set, using current root API-origin shape.
- Include rollback/delete steps and cost/free-tier verification.
- Include local commands to run before and after provisioning.
- Do not provision, deploy, log into providers, or create secrets.

## Output

Write response to:

`agent-communication/responses/ticket-104-yuna-preview-provisioning-preflight-response.md`
