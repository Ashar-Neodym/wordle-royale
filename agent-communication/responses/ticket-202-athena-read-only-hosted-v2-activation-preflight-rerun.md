# Ticket 202 Athena Read-Only Hosted V2 Activation Preflight Rerun

Task: Post-PR #13 read-only activation preflight
Agent: Athena
Status: FAIL — no writes

## Verified

- PR #13 merged as `0f673773929e861284fa72939f77fb3de3df6aaa`.
- Main CI run `29987861863` passed.
- Railway deployment `83c70b7e-afe6-416d-9945-aee01de4ee84` reached SUCCESS for the exact merge.
- The repaired Railway adapter passed the exact hosted inventory with one serving replica and one configured region.
- Hosted authority remained `v1_open`, generation `1`; no apply command was invoked.
- Operator dry-run had no `--apply` and performed no audit or authority write.

## Blockers found

1. The CLI entrypoint used strict provider lookup from the root Nest context and threw `UnknownElementException`. Athena repaired it locally by selecting `SpeedLifecycleOperatorModule` before strict lookup and added a real module-boot test; focused tests are 37/37 and typecheck passes. This fix is not merged.
2. After that local repair, the exact hosted dry-run advanced through provider proof and failed `reconciler_readiness_failed`.
3. Public `/readyz` confirmed `speedRuntime=unavailable`; `/ranked/modes` showed Speed fail-closed and lifecycle v2 unavailable while Standard remained enabled.
4. Current reconciler uses a 1-second transaction timeout and 2-second whole-pass/freshness budget, but performs database/schema/dictionary checks before each pass. The observed hosted readiness path took about 4.4 seconds, making healthy completion structurally impossible on this deployment path.

No lifecycle transition, generation change, provider setting change, dictionary mutation, gameplay action, or hosted write occurred.
