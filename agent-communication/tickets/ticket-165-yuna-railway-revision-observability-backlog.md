# Ticket 165 — Railway Revision Observability Backlog

Agent: Yuna (operations design)
Wave: Operations backlog
Status: Backlog; non-blocking

## Goal

Define a read-only, spoiler/secret-safe way to correlate the hosted Railway API with a source/build revision without provider-console access. Prefer deployment metadata or a minimal public build identifier that exposes no credentials, environment values, database details, or private commit data.

Architecture/runbook first; no provider change without approval.
