# Wordle Royale web UI direction — human, game-first, lichess-inspired

Date: 2026-06-30
Owner: Luna

## Product correction

Ashar's feedback is now a standing UI requirement: the web app should not feel like a glossy AI/SaaS dashboard. The target is a human game site: calm, functional, minimal, readable, community/rating oriented, and centered on playing Wordle Royale.

This direction is inspired by lichess' product feel, not its branding. Do not copy lichess logos, exact colors, or layout wholesale.

## Audit of the pre-reset web shell

The current Wave G shell works functionally, but several traits create an AI-generated/SaaS feel:

- Large marketing hero with oversized headline and product-pitch language.
- Decorative crown/logo mark, glowing shadows, radial page background, gradient hero, and card-heavy sections.
- Many rounded panels with status badges that feel like a SaaS dashboard rather than a game lobby.
- Navigation emphasizes sections of a landing page instead of the play/rating/community loop.
- Copy explains implementation details too prominently (`fixture`, `REST`, `client submits intent`) instead of speaking like a human game product.
- Lobby cards are visually similar to generic analytics cards; they should read more like a compact game room list.
- Gameplay board appears after marketing/status content instead of being the page's center of gravity.

## Direction principles

1. **Board first.** The Wordle board and current match state should be the visual anchor. Supporting panes (lobbies, players, rating) wrap around it.
2. **Quiet chrome.** Use flat surfaces, modest borders, small shadows only when needed, and no glow/hero gradients.
3. **Human copy.** Prefer short game-site labels: `Play`, `Lobby`, `Rated`, `Players`, `Standings`, `Server`. Avoid verbose implementation explanations in primary UI.
4. **Compact density.** More rows/lists, fewer oversized cards. Game sites should feel practical, not like a landing page.
5. **Ratings are first-class.** Keep profile/rating/leaderboard affordances visible and readable, even when backed by fixtures.
6. **Honest local state.** Preserve live-vs-fixture labels, but keep them as small system notes rather than big product claims.
7. **Spoiler safe.** Never expose plaintext answers, answer hashes, salts, or client-authoritative scoring in active play UI.

## Layout rules

### Page structure

- Top bar: compact text brand plus direct links: `Play`, `Lobbies`, `Leaderboard`, `Profile`.
- Main area: two-column game layout on desktop:
  - left: lobby/join/status column;
  - center/right: board/current match plus player/standing list.
- Secondary sections (waiting room, report, leaderboard) stay below, compact and table-like.
- Mobile: single column with board before long explanatory content.

### Navigation

Do:

- Use text-first nav.
- Keep controls reachable: create/join lobby and gameplay links near the top.
- Show API/fixture state as a small server status line.

Do not:

- Use a large decorative logo tile/glow as the visual center.
- Turn the home page into a marketing funnel.

### Colors

Preferred palette direction:

- App background: warm gray / muted brown-gray (`#302e2c`-like family) or calm slate.
- Surfaces: flat low-contrast panels (`#262421`, `#37342f`, muted off-white text).
- Primary action: restrained green (`#6b9b4a`-like), not neon/gold.
- Secondary action: neutral gray/brown.
- Alerts: muted amber/red/green, no high-glow saturated banners.

Do not:

- Use radial blue/gold gradients across the page.
- Use gold glow shadows as a persistent motif.
- Use glassmorphism/neon effects.

### Typography

- Body text should carry the product; keep display fonts modest.
- Use smaller headings and practical labels.
- Monospace is fine for lobby codes and match IDs only.
- Avoid all-caps eyebrow labels except small system/status text.

### Lobbies

- Present lobbies as compact room rows/cards: code, rated/casual, player count, state, actions.
- Prioritize `Join` and `Start rated` actions.
- Use disabled text for blockers: `Needs 2 players`, `Server offline`.
- Keep local API/fallback state visible but secondary.

### Gameplay

- The board should have a simple table/board feel.
- Player standings should read like a game sidebar, not analytics widgets.
- Status copy should be concise: `Server state`, `Fixture preview`, `No answer is exposed during play`.

### Rating/profile affordances

- Use rows that resemble a leaderboard/rating table.
- Make rating deltas textual (`+16`, `-16`, `provisional`) instead of relying only on color.
- Profile snippets should look like community/game identity, not CRM cards.

## First-pass implementation rules for Wave H

Future Luna/Jasmine tickets should check new UI against this list:

- [ ] No hero-gradient landing page treatment.
- [ ] No glow-heavy logo/card styling.
- [ ] Primary viewport emphasizes play/lobby/board before explanation.
- [ ] Copy reads like a game site, not a technical demo.
- [ ] Lobbies and standings are compact and scannable.
- [ ] Live/fallback state remains visible and honest.
- [ ] Spoiler safety is preserved.

## Follow-up UI tickets should do

- Replace remaining oversized section cards with denser room/leaderboard tables.
- Move live guess input/result feedback into the board area once backend endpoints support completion/result.
- Add a profile/rating sidebar with simple community affordances.
- Capture visual QA screenshots after each major UI pass.
