# Wave AC — Separate durable-auth production provisioning decision

Status: **MANIFEST COMPLETE / PROVISIONING BLOCKED**

Source: `55f84535cc2ac259c9b15ae6581e8f7acba6d6c1`

## Decision

Use a separate Vercel web project and a separate Railway project containing one API service and one PostgreSQL service in `southeast-asia`. Runtime database traffic will use Railway private networking. The accepted preview Vercel/Railway/Supabase resources remain unchanged.

Cost target: Railway Hobby, US$5 monthly minimum including US$5 usage credit, with no overage; Vercel Hobby US$0 while eligible. Current Railway billing-period usage was approximately US$1.3531 when observed. Supabase Free is rejected for production durability because it pauses after inactivity; Supabase Pro remains a later paid fallback if Railway backup/restore cannot satisfy G2/G9.

## G0 policy

Use strict no-secret G0. Create only empty Vercel, Railway project/environment, and API service shells. PostgreSQL creation is deferred to G1 because it intrinsically generates credentials. G0 permits no source linkage, deployment, variable, secret, domain, replica, migration, SQL, traffic, or preview mutation.

Canonical draft: `docs/wordle-royale-g0-provisioning-manifest.yaml`.

## Hard blockers before provisioning

1. Live provider provenance: current adapters are fixture/mock authenticated only.
2. Single-node PostgreSQL evidence: current inventory requires distinct replica IDs instead of two independent observations of one database.
3. Railway backup/restore capability must be proven before dormant migration/deployment and before any public registration.
4. Railway Hobby/billing change needs explicit cost approval.

## Sequence

1. Wave AD: repair live provider evidence and single-node observation semantics locally.
2. Independent QA and checkpoint PR/CI.
3. Refresh provider inventory, pricing, and source SHA.
4. Generate canonical single-use G0 manifest and request exact provisioning approval.
5. G0 empty shells only.
6. G1 separate PostgreSQL/secret/config approval.
7. Continue G2–G9 exactly as the activation runbook specifies.

No hosted resources, secrets, deployments, accounts, migrations, or provider configuration were changed during Wave AC.
