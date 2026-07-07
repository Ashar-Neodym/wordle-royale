# Preview release copy and mobile smoke note — Wave N

Date: 2026-07-06
Owner: Luna
Ticket: 100 — Preview Release Copy and Mobile Physical-Smoke Closure

## Public preview positioning

Wordle Royale's first public preview is a controlled web + hosted API preview, not a production launch.

Recommended concise copy:

```text
Wordle Royale public preview: demo sessions only. No durable accounts yet; sessions and preview data may reset. Mobile is experimental until physical-device smoke is complete.
```

## Required caveats for preview surfaces

- Demo sessions only; no real email/password account flow.
- Demo sessions are not durable accounts.
- Sessions may reset on API restart, redeploy, or data reset.
- Ratings, lobbies, match history, and demo profiles may be cleared between preview runs.
- Game results/rating remain server-authoritative; clients submit intents only.
- Invite/share/result surfaces must remain spoiler-safe and must not reveal active answers, hashes, salts, or hidden guesses.
- Mobile is manual-test/experimental only until physical Expo Go visual smoke is completed by Ashar.
- Free/cheap preview hosting may sleep, cold-start, or be temporarily unavailable.

## Web copy status

The web shell now shows a persistent preview notice on routed pages:

```text
Public preview — Demo sessions only — no durable accounts yet. Sessions, ratings, lobbies, match history, and demo profiles may reset. Mobile remains experimental until physical Expo Go smoke is complete.
```

The home preview card and settings placeholder also avoid local-stub or production-account language and state that demo sessions are non-durable/no-password preview state.

## Mobile physical smoke status

Status: `DEFERRED`

Reason: physical Expo Go visual confirmation requires Ashar to open the app on a phone. Ticket 94 re-verified the LAN API, mobile adapter, and Metro startup path; phone observation was unavailable and explicitly deferred.

Mobile is therefore safe to mention only as:

```text
Mobile Expo Go is available for manual smoke testing, but public mobile preview readiness is not claimed until physical-device smoke is complete.
```

## Exact phone checklist to close the mobile caveat

When Ashar has a phone available:

1. Start local dependencies/API and Expo in LAN mode from `apps/mobile/README.md`.
2. Open the emitted `exp://<LAN-IP>:<METRO-PORT>` URL in Expo Go while the phone is on the same Wi-Fi/LAN.
3. Confirm:
   - no red-screen runtime error;
   - `wr Wordle Royale` header fits without clipping;
   - `Play`, `Lobbies`, `Ratings`, and `Menu` nav chips wrap/remain tappable;
   - `Menu` subnav (`Profile`, `History`, `Rules`, `Settings`, `Server`) has no horizontal overflow;
   - board tiles, keyboard rows, lobby/rating/profile cards, and long API URL stay inside the screen;
   - API card shows the LAN API URL, not `localhost`;
   - API card shows health/ready connected and fixture/demo off while API is reachable;
   - fixture/demo fallback is clearly labeled if API is stopped or unreachable.

Do not mark mobile physical smoke as passed without this observation.
