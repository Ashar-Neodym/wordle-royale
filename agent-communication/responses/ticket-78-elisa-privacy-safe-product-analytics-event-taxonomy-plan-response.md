# Privacy-Safe Product Analytics and Event Taxonomy Plan — Response

## Summary

Ticket 78 is complete.

I created a privacy-safe MVP analytics/event taxonomy plan for Wordle Royale that covers the requested minimal events while keeping implementation out of scope:

- `page.viewed`
- `lobby.created`
- `lobby.joined`
- `match.started`
- `guess.submitted`
- `match.completed`
- `rating.changed`
- `api.error_observed`

Detailed plan saved here:

- `docs/2026-07-01-privacy-safe-product-analytics-event-taxonomy.md`

The plan is local/dev first, server-authoritative where possible, consent-gated for product analytics, and explicitly prohibits raw guesses, active answers, answer hashes/salts, tokens, private user data, raw URLs, and broad client autocapture.

## Decisions / Recommendations

1. **Use the existing `AnalyticsEvent` table for MVP.**
   - No new analytics table is needed for Wave K.
   - Existing fields (`userId`, `matchId`, `eventName`, `payload`, `consentScope`, timestamps) are sufficient.

2. **Keep `AuditLog` separate from product analytics.**
   - `AuditLog` is for admin/security/state-change evidence.
   - `AnalyticsEvent` is for product/reliability funnel and health events.

3. **Emit domain events from the backend after successful state transitions.**
   - Lobby/match/rating/guess events should be emitted after persistence succeeds, not when the client merely submits an intent.

4. **Do not add third-party analytics or autocapture.**
   - MVP boundary is local/dev logging and optional local database rows.
   - Future production analytics requires explicit consent behavior, retention policy, admin access policy, redaction tests, and provider approval.

5. **Reconcile consent enum naming before implementation.**
   - Shared contracts currently use `product_analytics`.
   - Prisma currently defines `ConsentScope.analytics_events`.
   - Recommendation: align Prisma to `product_analytics` in a migration or create one explicit adapter layer. Do not silently map the mismatch in multiple call sites.

## Detailed Output

The detailed taxonomy document defines:

- allowed event emitters;
- consent boundary per event;
- TypeScript-style payload contracts;
- fields that must never be collected;
- mapping to the existing Prisma `AnalyticsEvent` / `AuditLog` schema;
- local/dev vs future production boundary;
- handoff guidance for Freya, Luna, Ruby, and Jasmine;
- acceptance criteria for any future instrumentation ticket.

### Minimal event list

| Event | Purpose | Preferred emitter | Privacy rule |
|---|---|---|---|
| `page.viewed` | Navigation/product route health | Client local/dev or server route visibility | Store route pattern only; no raw URLs/query strings/handles/codes |
| `lobby.created` | Lobby funnel | API after lobby row creation | No lobby join code or unbounded settings JSON |
| `lobby.joined` | Discovery/join funnel | API after successful join | No join code, direct-link token, or invite identity |
| `match.started` | Matchmaking/game start reliability | API after active match + initial round exist | No answer, answer hash, answer salt, or dictionary internals |
| `guess.submitted` | Validation/game health | API after accepted/rejected guess | Outcome buckets only; no raw guess text or feedback letters with guesses |
| `match.completed` | Completion/rating health | API after completion/report/rating finalization | No raw guess trails or private report data |
| `rating.changed` | Rating-system health | Rating finalization transaction/projection | Prefer delta buckets; exact ledger stays in `RatingEvent` |
| `api.error_observed` | Reliability/error monitoring | API exception/envelope layer | No request bodies, headers, tokens, cookies, raw stack traces, or raw URLs |

## Open Questions

None blocking for Ticket 78.

Future decisions before production instrumentation:

1. Should production analytics stay in the application database or use a free/open-source analytics stack?
2. What retention period should apply to product analytics rows?
3. Should exact rating deltas ever be duplicated into analytics, or should dashboards read `RatingEvent` directly?
4. Does guest/anonymous funnel measurement matter enough to introduce an anonymous install/session ID?

## Follow-up Tickets

### Follow-up Ticket 1

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns backend/API implementation and Prisma schema changes.
- **Exact task:** When instrumentation is explicitly scoped, add an analytics emitter abstraction, reconcile the Prisma/shared-contract consent-scope mismatch, and persist only redacted/consent-gated `AnalyticsEvent` rows using the Ticket 78 taxonomy.
- **Inputs/context:** `docs/2026-07-01-privacy-safe-product-analytics-event-taxonomy.md`, `apps/api/prisma/schema.prisma`, current consent contracts, current domain services.
- **Expected output:** Emitter service, consent enforcement, redaction tests, no third-party provider, build/test/secret-scan evidence.

### Follow-up Ticket 2

- **Target agent:** Luna
- **Why that agent is needed:** Luna owns web/mobile UI instrumentation if/when allowed.
- **Exact task:** If `page.viewed` is later implemented, emit route patterns only and keep analytics disabled outside local/dev until server-side consent behavior exists.
- **Inputs/context:** Ticket 78 taxonomy, current app routes from Ticket 73.
- **Expected output:** Optional local/dev route-event hook, tests or documented smoke evidence proving no raw URL/query/lobby code is emitted.

### Follow-up Ticket 3

- **Target agent:** Jasmine
- **Why that agent is needed:** QA owns privacy/spoiler safety verification.
- **Exact task:** In Ticket 79 or future instrumentation QA, verify analytics payloads never include raw guesses, active answers, answer hashes/salts, tokens, cookies, raw URLs, or private account fields, and verify product analytics is not persisted without consent.
- **Inputs/context:** Tickets 73–78 responses and the analytics taxonomy doc.
- **Expected output:** Pass/fail privacy matrix with payload examples and blockers/warnings separated.

## Files Changed

- `docs/2026-07-01-privacy-safe-product-analytics-event-taxonomy.md`
- `agent-communication/responses/ticket-78-elisa-privacy-safe-product-analytics-event-taxonomy-plan-response.md`

No source code, contracts, Prisma schema, package files, migrations, or implementation files were changed.

## Tests / Commands Run

Inspection performed:

- `agent-communication/tickets/ticket-78-elisa-privacy-safe-product-analytics-event-taxonomy-plan.md`
- `agent-communication/index.md`
- `docs/2026-07-01-athena-review-after-tickets-65-71.md`
- `docs/2026-07-01-product-navigation-route-contracts-v2.md`
- `agent-communication/tickets/ticket-74-freya-profile-and-match-history-api-read-model-slice.md`
- `agent-communication/tickets/ticket-76-ruby-lobby-discovery-and-matchmaking-ux-slice.md`
- `apps/api/prisma/schema.prisma`
- `packages/contracts/src/auth/constants.ts`
- `packages/contracts/src/auth/schemas.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/realtime/constants.ts`
- current API envelope/error locations under `apps/api/src/shared/`

Commands run:

```bash
date +%F
```

Output:

```text
2026-07-01
```

Verification after file writes:

```bash
git diff --check
pnpm secret-scan
```

Observed output:

```text
# git diff --check
<no output; exit 0>

# pnpm secret-scan
$ node scripts/secret-scan.mjs
Secret scan passed (181 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

## Evidence / Result

Acceptance criteria status:

- **Define minimal events for local/dev/MVP:** yes; all requested event categories are covered with names and bounded payloads.
- **Define what must never be collected:** yes; explicit never-collect list covers secrets/tokens, active answers, answer hashes/salts, raw guesses, raw URLs, unnecessary personal data, and private account fields.
- **Map events to existing schema or recommend schema changes:** yes; maps to existing `AnalyticsEvent`, keeps `AuditLog` separate, and flags the `analytics_events` vs `product_analytics` consent enum mismatch.
- **Define local-only/dev logging vs future production analytics boundary:** yes; local/dev and future production requirements are separated.
- **Keep implementation out of scope:** yes; docs/response only, no source/schema/migration changes.

## Risks / Blockers

### Blockers

None for Ticket 78.

### Risks / warnings

1. **Consent enum mismatch:** Prisma `ConsentScope.analytics_events` and shared contracts `product_analytics` should be reconciled before persistence is implemented.
2. **High-volume event risk:** `guess.submitted` can become noisy; use buckets and consider sampling/aggregation later.
3. **Client autocapture risk:** avoid third-party snippets and raw route capture; route patterns only.
4. **Spoiler leakage risk:** active-match analytics must never include answers, answer hashes/salts, hidden opponent guesses, or dictionary internals.
5. **Operational-log confusion:** local stack traces/logs are not product analytics and must not be exported as analytics payloads.
