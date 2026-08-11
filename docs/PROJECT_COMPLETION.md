# Project completion contract

Wordle Royale is complete when players can rely on all of the following in a production-qualified deployment:

- Practice and Same-Puzzle Challenges that are useful, spoiler-safe, and honest about being local and unrated.
- Useful browser-local accessibility and display Settings.
- Durable accounts and sessions.
- The Standard queue, match, reconnect, and results journey.
- Ratings, leaderboard, public profile, and match history backed by durable data.
- Truthful treatment of unsupported modes: no fixture or preview behavior presented as production capability.
- Responsive, accessible, and security-reviewed player surfaces.
- Web, API, and database acceptance run against the exact shipped Git SHA.

## Completed capabilities

The repository contains the Practice and Same-Puzzle Challenge player paths, production-boundary account/API policy, and the core Standard multiplayer, rating, profile, leaderboard, and history surfaces needed for qualification. A capability is only production-complete after its exact-SHA acceptance gate passes; repository presence alone is not a production claim.

## Current local wave

This local wave adds device-specific Motion and Contrast settings with fail-closed browser-only persistence, pre-paint application, accessible controls, all-mode navigation, and exhaustive web-test discovery. It also records this durable completion contract. Settings never use cookies, account storage, an API, or network synchronization.

## Local follow-ups

- Remove remaining fixture fallbacks and dead deep links.
- Add pagination where durable lists can grow.
- Finish player copy and rules truth audits so every label matches shipped behavior.

## External gates — Ashar owned

Ashar owns qualification with a long-running Node API, PostgreSQL, the production dictionary, production secrets/configuration, migrations, canary rollout, and a two-user smoke test. Web, API, and database checks must all be recorded against the exact candidate SHA. Local builds or fixture-backed demonstrations do not satisfy these gates.

There are no `hello` or `neodym29` deployment resources to use or depend on. Verified changes push directly to Ashar's `main`; this project does not use pull requests for that handoff.
