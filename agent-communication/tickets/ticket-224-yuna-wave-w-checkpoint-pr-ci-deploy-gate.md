# Ticket 224 — Wave W Checkpoint PR, CI, and Deploy Gate

Agent: Yuna (checkpoint/devops)
Wave: W — Hosted V2 Concurrent-Ready Remediation
Status: Blocked on Ticket 227 PASS

After Ticket 227 PASS only, create a focused checkpoint from exact current `origin/main` containing only accepted Wave W/W-Fix backend/web source, tests, and evidence. Use explicit staging; preserve unrelated dirty files.

Run install/generate, focused and full API tests, required PostgreSQL suites, contracts, web tests/typecheck/build, workspace build, operator-context smoke, secret scan, and `git diff --check`. Open a PR and monitor the exact final head including documentation commits. Stop before merge.

Any merge requires explicit Ashar approval. After approved merge, verify exact main CI and Railway/Vercel deployment correlation. Do not run hosted gameplay; a fresh explicit Ticket 181 gameplay-write authorization is required. No lifecycle/provider/environment/dictionary mutation.
