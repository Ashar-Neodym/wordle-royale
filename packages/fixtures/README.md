# @wordle-royale/fixtures

Shared safe UI/API fixture catalog for Wordle Royale frontend, backend, and contract tests.

## Coverage

- Auth/onboarding/profile states.
- Lobby waiting/ready/full/locked/rated-private-disabled states and API envelopes.
- Gameplay active, pending submit, invalid word, solved, failed, timed-out, reconnecting, and resyncing states.
- Ranked/casual match reports with spoiler-safe share-card metadata.
- Loading, empty, reconnect, rate-limit, unauthorized/forbidden/server-unavailable states.

Fixtures intentionally avoid production word-list sources and hidden answer leakage. They are shaped to Ticket 10 state names and Ticket 12 fixture strategy while remaining dependency-free.
