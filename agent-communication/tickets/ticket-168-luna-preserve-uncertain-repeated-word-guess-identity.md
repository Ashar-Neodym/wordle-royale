# Ticket 168 — Preserve Uncertain Repeated-Word Guess Identity

Agent: Luna (web implementation)
Wave: T-Fix
Status: Blocked on Ticket 167

## Blocker

`SpeedGameplayPanel` clears an uncertain request when any accepted guess has the same word, so repeated-word retries can generate a third mutation ID.

## Requirements

1. Clear retained uncertain guess identity only when the authoritative snapshot confirms that exact operation ID.
2. Preserve the same request ID across dropped/uncertain responses and state refreshes.
3. Support repeated legal words as distinct attempts.
4. Add production-browser/server integration: first X accepted; second X commits but response drops; refresh correlates second request; retry cannot create a third attempt.
5. Preserve route state, accessibility, mutation no-auto-retry, and spoiler safety.

No hosted/provider mutation.
