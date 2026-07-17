# Ticket 160 — Live Speed Queue and Countdown UX

Agent: Luna (web implementation)
Wave: T — Live Speed/Blitz Ranked 1v1
Status: Blocked on Tickets 157–159

## Goal

Expose Speed as a truthful live queue with an accessible server-synchronized countdown and mode-specific rating surfaces.

## Acceptance

- Separate Standard and Speed find/search/cancel/reconnect/matched states.
- Server deadline is authoritative; client countdown is display-only and corrects drift.
- Refresh/reconnect recovers remaining time and authoritative match state.
- Clear latency, expiry, forfeit, and recoverable-error copy.
- Speed profile/leaderboard/history/result surfaces use live mode data.
- Classic/Multiplayer remain `Not live yet`.
- No duplicate mutation on client timeout/retry.
- Production browser tests cover countdown, reconnect, expiry, and accessibility.

No hosted deployment or provider mutation.
