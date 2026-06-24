# @wordle-royale/web

Minimal Next.js web shell for the Wordle Royale Crown Grid Arena frontend.

## Local commands

```bash
pnpm --filter @wordle-royale/web dev
pnpm --filter @wordle-royale/web typecheck
pnpm --filter @wordle-royale/web build
```

The shell is fixture-driven and does not call a backend. It imports design tokens from `@wordle-royale/design-tokens` and mock lobby/gameplay/report data from `@wordle-royale/fixtures`.
