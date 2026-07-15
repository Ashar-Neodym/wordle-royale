# Ticket 149 — Favicon and Application Metadata Polish

Agent: Luna (web implementation)
Wave: S — Hosted Reliability Polish
Status: New

## Goal

Remove the hosted `/favicon.ico` 404 and provide consistent minimal Wordle Royale application metadata.

## Requirements

1. Add a repository-owned favicon using Next-supported app metadata/static conventions.
2. Set concise title/description/theme metadata consistent with Wordle Royale.
3. Use only original/simple project artwork; add no paid/proprietary asset dependency.
4. Verify `/favicon.ico` resolves in production build and has the correct content type.
5. Confirm metadata does not expose secrets, answer data, or internal environment details.
6. Run web typecheck/build, relevant tests, secret scan, and diff check.

No provider or hosted mutation.
