# Ticket 246 web boundary repair — Luna response

Status: **complete; locally verified**

## Repairs

- Server actions now validate the raw request `Origin` against canonical `PUBLIC_WEB_URL` and require consistent canonical `Host` / optional `X-Forwarded-Host` before the auth request helper or `fetch` can run.
- Production API authority configuration rejects HTTP.
- Runtime cookie policy is explicit: production accepts, installs, forwards, and clears only Secure `__Host-wr_session`; non-production uses non-Secure `wr_session`.
- Raw `Cookie` is read through `headers()`. Duplicate durable names, coexistence of both durable names, and `wr_preview_demo_session` coexistence fail closed before fetch. Preview cookies are never forwarded.
- Logout uses an explicit empty `store.set` at `Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age=0`, epoch expiry, with runtime-correct `Secure` and cookie name.
- Account action notices are allowlisted and reconciled with current `/auth/me` truth. Stale/forged authenticated or signed-out query successes are suppressed when current state disagrees.

## Verification evidence

- Focused Ticket 246 tests: **10/10 passed**.
- Complete web test set through the workspace `tsx` toolchain: **66/66 passed**.
- Web TypeScript: passed (`pnpm typecheck`).
- Web production build: passed; Next generated **5/5** static pages.
- Workspace validation: passed (**9 workspace packages**).
- `git diff --check`: passed.

No network, hosted provider, GitHub, or deploy action was used.
