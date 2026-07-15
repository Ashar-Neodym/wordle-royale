# Ticket 149 — Favicon and Application Metadata Polish — Response

Task: Ticket 149 — Favicon and Application Metadata Polish
Agent: Luna (coder)
Status: Complete; ready for independent QA.

## Files changed

- `apps/web/src/app/favicon.ico`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/lib/application-metadata.ts`
- `apps/web/src/lib/application-metadata.test.ts`
- `agent-communication/responses/ticket-149-luna-favicon-application-metadata-polish-response.md`

## Implementation

### Repository-owned favicon

Added a 32×32, 32-bit ICO through Next’s supported App Router convention:

```text
apps/web/src/app/favicon.ico
```

The artwork is an original, simple green rounded Wordle-style tile with a cream `W` on the existing dark application background. It was generated locally and committed as the finished ICO; no paid, proprietary, remote, or runtime asset dependency was added.

Next owns favicon link generation from the App Router file. Explicit duplicate icon metadata was intentionally omitted after production inspection showed that it would create redundant `<link rel="icon">` entries.

### Application metadata

Extracted testable application metadata and viewport metadata:

```text
Title:            Wordle Royale
Application name: Wordle Royale
Description:      Rated, server-authoritative word games with live Standard matchmaking.
Theme color:      #769656
Color scheme:     dark
```

`layout.tsx` now exports the shared metadata and viewport objects. The copy contains no answers, puzzle salt, connection details, secrets, localhost references, or internal environment information.

## Verification

### TDD evidence

The metadata test was added first and initially failed because `application-metadata.ts` and the favicon did not exist.

Final focused test:

```text
pnpm --filter @wordle-royale/api exec node --import tsx --test \
  ../web/src/lib/application-metadata.test.ts
```

Exit 0: 2 tests passed.

The tests assert:

- exact public title, description, application name, theme color, and color scheme;
- absence of internal/secret terminology;
- valid ICO header;
- exactly one ICO image;
- 32×32 dimensions;
- non-empty repository-owned binary content.

Broader relevant web tests also passed:

```text
pnpm --filter @wordle-royale/api exec node --import tsx --test \
  ../web/src/lib/application-metadata.test.ts \
  ../web/src/lib/server-read-policy.test.ts \
  ../web/src/lib/matchmaking-deadline-policy.test.ts \
  ../web/src/components/standard-queue-state.test.ts
```

Exit 0: 16 tests passed.

### Typecheck and production build

```text
CI=true pnpm --filter @wordle-royale/web typecheck
```

Exit 0.

```text
CI=true pnpm --filter @wordle-royale/web build
```

Exit 0. Next compiled, typechecked, and generated all routes successfully.

### Production HTTP smoke

Started the completed production build locally and requested `/favicon.ico`:

```text
HTTP/1.1 200 OK
content-type: image/x-icon
```

Browser inspection of the production `/learn/rules` route confirmed:

- document title `Wordle Royale`;
- expected description;
- `theme-color` of `#769656`;
- `color-scheme` of `dark`;
- one generated favicon link with `type="image/x-icon"` and `sizes="32x32"`;
- zero browser JavaScript errors.

The temporary production process was stopped and port 3149 was confirmed closed.

### Repository checks

```text
CI=true pnpm typecheck
```

Exit 0. Workspace validation passed for 9 packages.

```text
CI=true pnpm secret-scan
```

Exit 0. Secret scan passed for 224 source/config files.

```text
git diff --check
```

Exit 0.

## Risks and follow-ups

- The favicon intentionally targets the required minimal 32×32 desktop/browser use case; larger install/PWA icon sets remain out of scope.
- No hosted deployment, provider mutation, database operation, migration, pull request, or merge was performed.
