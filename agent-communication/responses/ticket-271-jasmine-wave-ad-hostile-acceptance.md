# Ticket 271 — Jasmine — Wave AD hostile acceptance contract

Status: **RED until implemented**

Permanent tests must cover:

- absolute executable realpath/digest/version/owner/mode and no ambient PATH trust;
- `shell:false`, fixed argv, minimal environment, stdin closed, timeout and independent stdout/stderr bounds;
- challenge freshness/replay/mixed-run rejection and protected expected identity policy;
- partial provider failure leaves no valid bundle;
- redirect/TLS downgrade/bad CA/authority, malformed or oversized JSON, duplicate keys, deep/trailing data;
- stderr/environment/argv/config/token/URL/credential non-disclosure;
- signing-key no-follow/owner/mode/rotation and atomic bundle publication;
- one-node PostgreSQL: unique observation IDs/methods, repeated node accepted, duplicate method/digest rejected, direct versus pooler enforced, scope/schema disagreements rejected;
- fixture/live separation and production rejection of all test seams;
- production CLI E2E using controlled fake executables and local TLS fixtures with network isolation.

No live provider calls are permitted during implementation QA.
