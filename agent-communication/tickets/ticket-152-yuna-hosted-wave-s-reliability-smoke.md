# Ticket 152 — Hosted Wave S Reliability Smoke

Agent: Yuna (devops verification)
Wave: S — Hosted Reliability Polish
Status: Blocked on approved Ticket 151 merge and green main CI

## Required checks

1. Confirm Railway/Vercel serve the merged main SHA.
2. Verify health/readiness remain `ok` and Standard queue remains live.
3. Exercise delayed/cold profile, leaderboard, `/play`, and current-user reads; confirm bounded recovery or clear retry UX.
4. Confirm no duplicate queue/gameplay mutation occurs.
5. Verify `/favicon.ico` is 200 with correct content type and metadata appears correctly.
6. Check browser console/network for regressions.
7. Do not mutate provider settings or rerun dictionary bootstrap.

Return PASS/WARN/FAIL.
