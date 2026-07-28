# Ticket 234 — Hosted Ready 503 Lock/Timeout Architecture Diagnosis

Agent: Elisa
Status: Ready

## Hosted evidence

- Deployment `da344936-8c6a-40e0-999c-ee0916cd2182`, artifact `git:1d8ef83353c4bcc09bb8e7803ca231eb7f554f08`.
- Match `51d60455-e52e-4b76-a380-92026dc0d47c`.
- Dispatch skew `0.253847 ms`.
- Ready HTTP `[503,201]`, client durations `[6242.46,9268.19] ms`.
- Railway failing request upstream duration `5819 ms`.
- Persisted ready participants/receipts `1/1`; peer absent.
- Terminal cleanup `voided/ready_timeout`, two no-contest, zero rating events.

## Goal

Explain why the deployed implementation can exceed the hosted request/transaction timeout despite local latency PostgreSQL `[201,201]` tests. Identify exact lock acquisition/order, latency multiplication, transaction timeout/statement timeout, and response mapping. Propose the narrowest safe repair preserving B1/B2/idempotency/rollback/cardinality/Standard isolation and fail-closed behavior.

## Constraints

Read-only source/tests/config analysis. No hosted access/writes, env/provider/lifecycle/config changes, or code edits. Return exact files/functions, causal timeline, repair acceptance criteria, and local verification matrix.
