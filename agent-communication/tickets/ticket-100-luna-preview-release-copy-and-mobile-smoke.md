# Ticket 100 — Preview Release Copy and Mobile Physical-Smoke Closure

Agent: Luna (frontend/mobile)
Wave: N — Controlled public preview setup
Status: New

## Context

Wave M is merged to `main`; post-merge `main` CI passed.

Known user-facing caveats:
- preview demo sessions are in-memory/non-durable;
- preview data may reset;
- full production auth does not exist;
- physical Expo Go visual smoke remains deferred unless Ashar can observe a phone.

## Task

Prepare public-preview-facing copy and close or clearly preserve the mobile physical-smoke caveat.

## Scope

- Ensure web copy honestly says preview/demo sessions may reset.
- Ensure no UI implies real durable accounts or production launch.
- Add/update a small preview release note/checklist if useful.
- If Ashar can observe a phone: provide exact Expo Go physical smoke steps and record pass/fail evidence.
- If phone observation is unavailable: keep the caveat explicit and non-blocking for web/API preview only.

## Constraints

- Do not deploy.
- Do not add app-store/EAS/public mobile release work.
- Do not add secrets or external accounts.
- Do not over-polish; keep copy minimal and clear.

## Acceptance criteria

- Web preview caveats are visible and honest.
- Mobile physical-smoke status is either closed with evidence or explicitly deferred.
- Web/mobile builds pass if code changes are made.
- Response includes exact verification commands and evidence.

## Response file

Write your response to:

`agent-communication/responses/ticket-100-luna-preview-release-copy-and-mobile-smoke-response.md`
