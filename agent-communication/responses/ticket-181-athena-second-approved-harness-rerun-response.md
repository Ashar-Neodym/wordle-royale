# Ticket 181 — Second Approved Harness Rerun Response

Agent: Athena tracked execution
Status: FAIL / operationally inconclusive; no product concurrent-ready verdict

## Approval identity

- Railway deployment: `da344936-8c6a-40e0-999c-ee0916cd2182`
- Artifact: `git:1d8ef83353c4bcc09bb8e7803ca231eb7f554f08`
- Approved amended harness bundle: `sha256:e204ae0f367a3ad6669ebc5c83dc85c6ce85225a7c754dbf25b584c80d9f99fb`

## Execution

- Preflight health/readiness/catalog/revision: PASS.
- Sessions: 2.
- Queue posts: 2.
- Fresh shared lifecycle: 1.
- Match: `1703cd21-f66b-49d7-8ef7-34057c91f224`.
- Ready posts: 0.
- Harness failure: `distinct_match_participants_required` before ready dispatch.

## Terminal recovery

Direct read-only database recovery after the invitation window proved:

- status: `voided`;
- completion reason: `invitation_timeout`;
- both participant `readyAt`: null;
- both terminal reasons: `no_contest`;
- rating events: 0.

No second match or blind mutation retry was attempted.

## Root cause

The public `speedMatchSnapshotSchema` intentionally omits participant identities. The harness incorrectly required an invented `initial.participants` projection. Session and matchmaking contracts already provide the valid distinct-actor proof through unique users/cookies/tickets, one shared match, and reciprocal `matchedOpponent.userId`.

Ticket 233 removed the invalid assumption and independently passed 33/33 local tests plus workspace/security gates. No hosted access occurred during repair.

## Verdict

Ticket 181 remains FAIL/inconclusive because the approved lifecycle did not reach simultaneous-ready dispatch. Ticket 182 remains blocked. A fresh lifecycle approval must bind the Ticket 233 harness hash.
