# Ticket 181 — Third Approved Hosted Concurrent-Ready Rerun Response

Agent: Athena tracked execution
Status: FAIL — product concurrency/reliability blocker reproduced

## Identity

- Railway deployment: `da344936-8c6a-40e0-999c-ee0916cd2182`
- Artifact: `git:1d8ef83353c4bcc09bb8e7803ca231eb7f554f08`
- Harness bundle: `sha256:eb6f0e7a1bd9f05a2a7fbe1630f71e6bcf692e0e443cdb80733d263bbd8b0b10`

## Result

- Preflight health/readiness/catalog/revision: PASS.
- Sessions: 2; queue posts: 2; lifecycle: exactly 1.
- Match: `51d60455-e52e-4b76-a380-92026dc0d47c`.
- Concurrent-ready dispatch skew: `0.253847 ms`.
- HTTP statuses: `[503,201]`.
- Client durations: `[6242.46,9268.19] ms`.
- Blind retries: 0.
- Railway failing request upstream duration: `5819 ms`, request ID `GIsuIbYzQYW9RQBwwUFZXw`.

## Persistence and cleanup

- Ready participants: 1/2.
- Ready mutation receipts: 1.
- Match terminalized `voided/ready_timeout`.
- Both participants: `no_contest`.
- Rating events: 0.

## Verdict

Strict FAIL. This is the intended product gate, not a harness failure. Hosted Speed cannot be release-accepted while simultaneous valid ready requests can return 503 and persist only one acknowledgement. Ticket 182 remains blocked. Routed to Ticket 234 diagnosis and a subsequent local repair/independent QA wave. No additional hosted gameplay is authorized.
