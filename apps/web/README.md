# @wordle-royale/web

Minimal Next.js web shell for the Wordle Royale Crown Grid Arena frontend.

## Local commands

```bash
pnpm --filter @wordle-royale/web dev
pnpm --filter @wordle-royale/web typecheck
pnpm --filter @wordle-royale/web build
```

## Local API integration

The shell can read the local API skeleton/stubs when available and falls back to shared fixtures when unavailable.

1. Copy the app-specific example if you want to override the default API URL:

```bash
cp apps/web/.env.local.example apps/web/.env.local
```

2. Default URL:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:3001
```

3. Start the API in one terminal and the web app in another:

```bash
pnpm --filter @wordle-royale/api dev
pnpm --filter @wordle-royale/web dev
```

Current API-backed data is intentionally limited to health/readiness, stub current profile, and lobby list display. Lobby create/join helpers exist in `src/lib/api-client.ts`, but the page does not perform real gameplay/auth flows.

The shell imports design tokens from `@wordle-royale/design-tokens`, fallback mock data from `@wordle-royale/fixtures`, and type contracts from `@wordle-royale/contracts` where available.
