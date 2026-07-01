# REST Envelope and API Integration Contract Amendments — Response

## Summary

Ticket 32 is complete.

I decided REST response envelope schemas **do belong in `@wordle-royale/contracts` now** because both the API skeleton and upcoming web/mobile integration need the same envelope, validation-error, request-id, list, and readiness dependency shapes. Keeping these API-local would force Ticket 33/34 implementers to either copy DTOs or reverse-engineer the API helper.

Implemented minimal shared contracts for:

- success response envelopes,
- error response envelopes,
- validation error issue/details shape,
- request-id metadata,
- list/pagination envelope data,
- readiness dependency status and dependency map shape.

Also typed the API skeleton’s local envelope helper against the shared contract types without changing runtime behavior.

## Decisions / Recommendations

1. **Decision: share envelope schemas in `@wordle-royale/contracts`.**
   - Reason: response envelopes are cross-boundary API contracts, not API-internal implementation details.
   - Consumers: Freya backend services, Luna web API client, future mobile API client, Jasmine QA fixtures.

2. **Decision: keep envelope construction API-local.**
   - Shared contracts define shape and TypeScript types.
   - `apps/api/src/shared/envelope.ts` remains the runtime helper responsible for reading/generating request IDs and returning objects.
   - This avoids pulling Nest/HTTP request concepts into the contracts package.

3. **Decision: preserve current Ticket 27 envelope wire format.**
   - Success remains:
     ```json
     { "data": {}, "error": null, "requestId": "..." }
     ```
   - Failure remains:
     ```json
     { "data": null, "error": { "code": "...", "message": "...", "details": {} }, "requestId": "..." }
     ```

4. **Decision: list envelopes use `data.items` plus `data.pagination`.**
   - Chosen shape:
     ```json
     {
       "data": {
         "items": [],
         "pagination": { "nextCursor": null }
       },
       "error": null,
       "requestId": "..."
     }
     ```
   - This keeps pagination metadata under `data`, so the top-level envelope stays consistent.

5. **Decision: readiness dependency status is shared, but checks remain backend-owned.**
   - Shared statuses: `ok`, `degraded`, `unavailable`, `not_checked_stub`.
   - Actual DB/Redis checking is still Ticket 33/Freya or Yuna scope, not Ticket 32.

## Detailed Output

### Shared contract additions

Updated `packages/contracts/src/common/schemas.ts` with:

- `requestMetadataSchema`
- `validationErrorIssueSchema`
- `validationErrorDetailsSchema`
- existing `errorEnvelopeSchema` retained
- existing `successEnvelopeSchema(dataSchema)` retained
- `listEnvelopeDataSchema(itemSchema)`
- `listEnvelopeSchema(itemSchema)`
- `readinessDependencyStatusSchema`
- `readinessDependencySchema`
- `readinessDependenciesSchema`
- `readinessStatusSchema`

Updated `packages/contracts/src/common/types.ts` with inferred/exported types for:

- `RequestMetadata`
- `ValidationErrorIssue`
- `ValidationErrorDetails`
- `ErrorDetail`
- `ErrorEnvelope`
- `SuccessEnvelope<T>`
- `ListEnvelopeData<T>`
- `ListEnvelope<T>`
- `ReadinessDependencyStatus`
- `ReadinessDependency`
- `ReadinessDependencies`
- `ReadinessStatus`

`packages/contracts/src/index.ts` already exports `./common/schemas.ts` and `./common/types.ts`, so no index export change was needed for this ticket.

### API integration update

Updated `apps/api/src/shared/envelope.ts` so:

- `ok<T>()` returns shared `SuccessEnvelope<T>`.
- `fail()` returns shared `ErrorEnvelope`.
- Request-id extraction/generation remains API-local.

This gives backend/frontend agents a single shared type source while preserving the API helper’s existing runtime behavior.

### Tests added

Added four contract tests to `packages/contracts/src/common/contracts.test.ts` covering:

1. REST success/error envelope validation with request metadata.
2. Validation error details as API-compatible `issues` arrays.
3. List envelope wrapping `items` with pagination metadata.
4. Readiness status with both `not_checked_stub` placeholders and future live-check fields.

Existing Ticket 25 behavior remains covered and passing:

- consent scope spelling,
- private rated lobby rejection,
- intent-only guess request,
- realtime event constants,
- accepted guess event payload,
- participant-only match report,
- spoiler-safe share card,
- word-library artifact tests.

## Open Questions

None for Elisa on Ticket 32.

Implementation agents should treat this as the settled envelope contract unless Athena/Ashar explicitly changes it.

## Follow-up Tickets

### Follow-up Ticket 1

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns backend service/persistence implementation.
- **Exact task:** Use `SuccessEnvelope<T>`, `ErrorEnvelope`, `ValidationErrorDetails`, `ListEnvelope<T>`, and `ReadinessStatus` from `@wordle-royale/contracts` in Ticket 33 while replacing profile/lobby stubs with Prisma-backed services.
- **Inputs/context they need:** Ticket 32 response, `packages/contracts/src/common/*`, `apps/api/src/shared/envelope.ts`, Ticket 33.
- **Expected output back to Athena:** Backend implementation summary showing shared envelope contracts are used and API tests pass.

### Follow-up Ticket 2

- **Target agent:** Luna
- **Why that agent is needed:** Luna owns web/API-client integration.
- **Exact task:** Build the web API client around the shared envelope contract: success responses unwrap `data`, error responses surface `error.code/message/details`, and list calls consume `data.items` plus `data.pagination.nextCursor`.
- **Inputs/context they need:** Ticket 32 response, `@wordle-royale/contracts` common exports, Ticket 34.
- **Expected output back to Athena:** Web integration response showing no duplicated local envelope DTOs and web build evidence.

### Follow-up Ticket 3

- **Target agent:** Jasmine
- **Why that agent is needed:** Jasmine owns independent QA.
- **Exact task:** In Wave E QA, verify API runtime responses match the shared success/error/list/readiness envelope schemas.
- **Inputs/context they need:** Ticket 32 response, Ticket 33 backend response, Ticket 34 web integration response.
- **Expected output back to Athena:** Pass/fail matrix with exact API response samples and schema mismatch notes if any.

## Files Changed

- `packages/contracts/src/common/schemas.ts`
- `packages/contracts/src/common/types.ts`
- `packages/contracts/src/common/contracts.test.ts`
- `apps/api/src/shared/envelope.ts`
- `agent-communication/responses/ticket-32-elisa-rest-envelope-api-integration-contracts-response.md`

## Tests / Commands Run

### Command

```bash
pnpm --filter @wordle-royale/contracts test
```

Exit code: `0`.

Relevant output:

```text
✔ REST success and error envelopes validate request metadata
✔ validation error details use API-compatible issue arrays
✔ list envelope schema wraps items with pagination metadata
✔ readiness status supports dependency placeholders and future live checks
✔ consent scope uses exact training_insights_opt_in spelling
✔ private rated lobbies are rejected for V1
✔ guess submit request contains intent only and no score or answer authority
✔ server event names are exported string literals
✔ guess accepted realtime event validates feedback payload
✔ match report is participant-only capable and includes score breakdown
✔ share card schema requires spoilerSafe true
✔ word list artifact schema accepts fixture list metadata and words
✔ manifest schema requires deterministic list checksums
✔ validation report schema exposes failed checks
ℹ tests 14
ℹ pass 14
ℹ fail 0
```

### Command

```bash
pnpm --filter @wordle-royale/contracts build
```

Exit code: `0`.

Output:

```text
$ tsc -p tsconfig.json
```

### Command

```bash
pnpm --filter @wordle-royale/api build && pnpm --filter @wordle-royale/api test
```

Exit code: `0`.

Relevant output:

```text
$ tsc --noEmit -p tsconfig.json
✔ schema uses PostgreSQL provider and app env datasource
✔ schema covers users profiles consent and analytics audit basics
✔ schema stores dictionary versions and per-word metadata without production source content
✔ schema covers lobby match round participant guesses scores and reports
✔ schema supports rating events idempotency voids reversals and leaderboard profiles
▶ api skeleton
  ✔ serves health and readiness envelopes
  ✔ rejects malformed lobby creation with the shared error envelope
  ✔ creates and joins lobby stubs with shared contract-shaped payloads
ℹ tests 8
ℹ pass 8
ℹ fail 0
```

### Command

```bash
pnpm --filter @wordle-royale/contracts test && pnpm --filter @wordle-royale/contracts build && pnpm --filter @wordle-royale/web build && pnpm --filter @wordle-royale/mobile build && pnpm build
```

Exit code: `0`.

Relevant output:

```text
ℹ tests 14
ℹ pass 14
ℹ fail 0
$ tsc -p tsconfig.json
$ next build
✓ Compiled successfully
$ expo config --type public >/dev/null && tsc --noEmit -p tsconfig.json
$ pnpm -r --if-present build
packages/contracts build: Done
apps/api build: Done
apps/mobile build: Done
apps/web build: Done
```

### Command

```bash
git status --short
```

Exit code: `0`.

Relevant observation:

```text
 M packages/contracts/src/common/contracts.test.ts
 M packages/contracts/src/common/schemas.ts
 M packages/contracts/src/common/types.ts
?? apps/api/src/shared/
?? agent-communication/tickets/ticket-32-elisa-rest-envelope-api-integration-contracts.md
```

The working tree also contains many pre-existing Wave D/E changes from other agents/tickets. I did not claim ownership of those unrelated files.

## Evidence / Result

Acceptance criteria status:

- **`pnpm --filter @wordle-royale/contracts test` passes:** yes, 14/14 tests passed.
- **`pnpm --filter @wordle-royale/contracts build` passes:** yes.
- **Existing API build/test not broken:** yes, API build and 8/8 API tests passed.
- **Existing web/mobile builds not broken:** yes, web and mobile builds passed.
- **Root build not broken:** yes, `pnpm build` passed.
- **Clear decision documented for shared vs API-local:** yes; schemas/types are shared, runtime envelope construction remains API-local.
- **No paid services, secrets, deployment, or production auth behavior added:** yes; only local TypeScript/Zod contracts and API typing were changed.

## Risks / Blockers

1. **API runtime still needs deeper integration.** Ticket 32 defines and types envelope contracts, but Ticket 33 must use them while replacing stubs with Prisma-backed services.
2. **Web/mobile clients must not duplicate DTOs.** Luna should import envelope/list/readiness types from `@wordle-royale/contracts` instead of defining local copies.
3. **Readiness dependency checks are contract-only here.** `not_checked_stub` remains valid for skeleton responses, but real DB/Redis checks are future backend/ops work.
4. **Working tree has unrelated uncommitted files.** The repo contains other agents’ Wave D/E changes. Athena should review the full diff before committing.
