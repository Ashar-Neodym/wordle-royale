# Ticket 12 — Frontend Design System and App Shell Implementation Plan — Response

## Summary

Created the frontend foundation implementation plan for Wordle Royale. This plan turns Ticket 03's UX flow into a build sequence for design tokens, shared primitives, web/mobile app shells, navigation, mock data, fixture-driven screens, accessibility support, and visual QA.

This is a planning/spec ticket. No product code was created or modified.

## Decisions / Recommendations

- Use a TypeScript monorepo-style frontend structure so web, mobile, contracts, fixtures, and design tokens can evolve together without copy/paste drift.
- Implement design tokens before feature screens. Ticket 09's locked brand direction is `Crown Grid Arena`, so tokens should include tile colors, rank accents, reduced-motion behavior, and colorblind/high-contrast variants from the start.
- Build shared logic and types across platforms, but keep UI renderers platform-specific where needed. React DOM and React Native should share intent, not force identical component internals.
- Use fixtures and mocked clients until backend endpoints and Socket.IO events are live. The mock layer should mirror Ticket 02's API envelope and error codes so replacing mocks with generated clients is low-risk.
- Prioritize the app shell, navigation, auth/onboarding shells, home dashboard, lobby flows, gameplay shell, and match report/profile shells in that order.
- Treat accessibility primitives as foundational components, not later QA polish.
- Do not let frontend gameplay calculate authoritative outcomes. It should render server-shaped state and emit player intents only.

## Detailed Output

### 1. Proposed frontend folder/package structure

Recommended repository layout:

```text
wordle-royale/
  apps/
    web/
      app/                         # Next.js routes/app router
      components/                  # Web-only composition components
      providers/                   # Web app providers
      public/                      # Static assets
      styles/                      # Global CSS entrypoints
      tests/                       # Web integration/e2e tests

    mobile/
      app/                         # Expo Router screens
      components/                  # Mobile-only composition components
      providers/                   # Mobile app providers
      assets/                      # Icons/splash/fonts
      tests/                       # Mobile component/integration tests

  packages/
    design-tokens/
      src/
        colors.ts
        typography.ts
        spacing.ts
        radius.ts
        shadows.ts
        motion.ts
        tiles.ts
        ranks.ts
        themes.ts
      dist/                        # Generated CSS vars / RN tokens later

    ui-core/
      src/
        primitives/                # Platform-agnostic prop contracts where useful
        accessibility/             # Shared a11y helpers and labels
        feedback/                  # Shared tile/keyboard feedback enums
        index.ts

    ui-web/
      src/
        primitives/                # DOM implementations
        layout/
        game/
        lobby/
        reports/
        profile/
        index.ts

    ui-mobile/
      src/
        primitives/                # React Native implementations
        layout/
        game/
        lobby/
        reports/
        profile/
        index.ts

    contracts/
      src/
        api/                       # Generated or hand-maintained API types until generation exists
        socket/                    # Socket.IO event types
        domain/                    # User, lobby, match, rating, settings models
        errors.ts
        envelope.ts
        index.ts

    api-client/
      src/
        restClient.ts
        authClient.ts
        lobbyClient.ts
        matchClient.ts
        profileClient.ts
        leaderboardClient.ts
        mockClient.ts
        index.ts

    realtime-client/
      src/
        socketClient.ts
        lobbySocket.ts
        matchSocket.ts
        mockSocket.ts
        index.ts

    fixtures/
      src/
        users.ts
        auth.ts
        lobbies.ts
        matchmaking.ts
        matches.ts
        rounds.ts
        guesses.ts
        reports.ts
        leaderboard.ts
        settings.ts
        errors.ts
        scenarios.ts
        index.ts

    app-state/
      src/
        authStore.ts
        profileStore.ts
        consentStore.ts
        lobbyStore.ts
        matchStore.ts
        connectionStore.ts
        settingsStore.ts
        index.ts

    config/
      src/
        featureFlags.ts
        routes.ts
        env.ts
        platform.ts

  docs/
    frontend/
      design-system.md
      navigation.md
      fixture-strategy.md
      accessibility.md
      visual-qa.md
```

If Athena wants a smaller first pass, collapse `ui-core`, `ui-web`, and `ui-mobile` into app-local components at first, but keep `design-tokens`, `contracts`, `fixtures`, and clients separate. Those packages reduce the highest risk: contract drift between web, mobile, and backend.

### 2. Design system component list

#### Design tokens

- Color roles:
  - Background: app, surface, elevated, overlay
  - Text: primary, secondary, muted, inverse, disabled
  - Border: default, strong, focus, danger
  - Actions: primary, secondary, success, warning, danger
  - Tile states: empty, pending, correct, present, absent, invalid, locked
  - Connection states: live, reconnecting, offline, error
  - Ranked states: rated, unrated, MMR gain, MMR loss, provisional
- Typography:
  - Display/logo
  - Heading scale
  - Body scale
  - Small/meta text
  - Timer/stat/monospace numerals
- Spacing scale
- Radius scale
- Shadow/elevation scale
- Motion durations/easings
- Reduced-motion token overrides
- Z-index/layering scale
- Breakpoints for web
- Mobile safe-area spacing
- Rank badge tokens
- Share-card export dimensions and visual constants

#### Primitive components

- Button
- IconButton
- TextInput
- PasswordInput
- CodeInput
- Checkbox
- Switch/Toggle
- Select
- SegmentedControl
- Slider, if timers/player counts use it
- Modal
- Drawer/BottomSheet
- Popover/Tooltip, web only where needed
- Toast
- Banner
- Card
- Tabs
- Table, web first
- ListItem
- Avatar
- Badge
- StatCard
- ProgressBar
- CountdownTimer
- Skeleton
- EmptyState
- ErrorState
- LoadingOverlay
- VisuallyHidden
- FocusRing
- LiveRegion, web
- ScreenReaderAnnouncement abstraction for mobile/web

#### Product components

- PublicHeader
- AppShell
- MobileTabShell
- AuthCard
- OnboardingStepper
- ConsentPanel
- HomeActionGrid
- ActiveMatchCard
- RatingSummaryCard
- QuickJoinPanel
- CreateLobbyForm
- JoinCodeForm
- PublicLobbyFilters
- PublicLobbyList
- LobbyCodeShare
- LobbySettingsSummary
- PlayerList
- PlayerReadyRow
- HostControls
- LobbyStatusBanner
- WordGrid
- WordGridRow
- WordTile
- GameKeyboard
- KeyboardKey
- RoundStatusBar
- PlayerProgressPanel
- ConnectionStatusBanner
- InvalidWordFeedback
- RoundTransitionSummary
- MatchStandingsTable
- PerRoundBreakdown
- RatingChangeCard
- ShareResultCard
- LeaderboardTable
- ProfileHeader
- StatsGrid
- MatchHistoryList
- RatingHistoryChart
- PrivacyControlsForm
- AccountDeletionPanel

### 3. Implementation phases

#### Phase 0: frontend workspace and contracts skeleton

Goal: create the frontend workspace and shared package boundaries.

Tasks:

- Set up `apps/web`, `apps/mobile`, and shared packages.
- Add TypeScript config shared across apps.
- Add lint/format/test scripts.
- Add minimal CI commands once repo tooling exists.
- Define route constants and feature flags.
- Create placeholder contract types matching Ticket 02 envelope shape.

Exit criteria:

- Web app boots to a placeholder page.
- Mobile app boots to a placeholder screen.
- Shared packages compile.

#### Phase 1: design tokens and primitive components

Goal: build the visual foundation using Crown Grid Arena.

Tasks:

- Implement tokens for colors, typography, spacing, radius, shadows, motion, tile states, and rank accents.
- Export CSS variables for web.
- Export TypeScript/RN token objects for mobile.
- Build primitive components with loading, disabled, focus, error, and high-contrast states.
- Build tile state primitives with non-color indicators.

Exit criteria:

- Primitive component previews exist.
- Tokens support normal, colorblind, high-contrast, and reduced-motion modes.
- Buttons/inputs/cards/tile states can be visually reviewed.

#### Phase 2: app shell and navigation

Goal: create stable navigation for public, auth, authenticated, and gameplay contexts.

Tasks:

- Web:
  - Public layout for landing/auth routes.
  - Authenticated app shell with desktop side nav and mobile responsive nav.
  - Gameplay full-screen shell that hides nonessential nav.
- Mobile:
  - Expo Router route groups.
  - Bottom tabs for Home, Play, Leaderboard, History, Profile/Settings.
  - Full-screen gameplay route group.
- Add route guards using mocked auth/profile completion state.

Exit criteria:

- User can move through public, auth, onboarding, home, lobby, gameplay, report, profile, and settings shell routes with mock state.

#### Phase 3: mock clients and fixtures

Goal: let frontend screens work before backend completion.

Tasks:

- Build fixture data for users, lobbies, matches, rounds, guesses, reports, ratings, and errors.
- Build mock REST client returning Ticket 02-style envelopes:

```ts
type ApiEnvelope<T> = {
  data: T | null;
  error: ApiError | null;
  requestId: string;
};
```

- Build mock Socket.IO client that can simulate lobby events, match state updates, timer ticks, reconnect, and errors.
- Add scenario fixtures:
  - new user onboarding
  - casual private lobby waiting
  - public lobby browser empty/full
  - active round
  - invalid word
  - solved state
  - timed out state
  - reconnecting state
  - ranked match report

Exit criteria:

- Screens can switch between fixture scenarios without backend.
- Fixture models are close enough to Ticket 02 contract to avoid rewrite later.

#### Phase 4: auth, onboarding, and home shells

Goal: implement first user entry flow without live auth dependency.

Tasks:

- Login/register/forgot password forms using mock auth client.
- Display name/handle setup screen.
- Privacy and analytics consent screen with `necessary`, `product_analytics`, and `training_insights_opt_in` labels.
- Home dashboard with quick actions, rating card, recent match card, and rejoinable match card.

Exit criteria:

- Mocked new-user flow can route from public landing to onboarding to home.
- Consent state can be changed and reflected in settings fixtures.

#### Phase 5: lobby and matchmaking screens with mock data

Goal: implement the core pre-game flow.

Tasks:

- Quick Join panel and waiting state.
- Create Lobby form using locked defaults:
  - Standard English 5-letter mode
  - Casual 2-4 players
  - 6 guesses
  - ranked timer default 120 seconds
  - rated private disabled by default for V1
- Join by Code flow.
- Public Lobby Browser with filters and empty/full/error states.
- Lobby Waiting Room with player list, ready states, host indicator, public/private, rated/unrated, difficulty, rounds, timer, player count, share action, and host start button.
- Host Settings Panel.

Exit criteria:

- User can create/join/browse mock lobbies.
- Lobby state changes can be simulated.
- Host start button shows clear disabled reasons.

#### Phase 6: gameplay UI shell with fixtures

Goal: implement the gameplay surface without authoritative game logic.

Tasks:

- WordGrid, WordTile, and GameKeyboard.
- RoundStatusBar with timer, round number, score, and connection state.
- PlayerProgressPanel for desktop and compact strip for mobile.
- InvalidWordFeedback.
- Solved, failed, timed-out, submitted, locked, reconnecting, and reconnected states.
- Keyboard input support on web.
- Reduced-motion behavior for tile feedback.

Exit criteria:

- Fixture scenarios render active round, invalid guess, solved, failed, timed out, and reconnect states.
- UI emits `submitGuess` intent but does not validate guesses locally beyond basic input shape.

#### Phase 7: match report, profile, leaderboard, settings shells

Goal: complete the first screen set for ranked/casual replay loop.

Tasks:

- Match Report with placement, total score, per-round breakdown, guess counts, solve times, rating/MMR delta if rated, rematch, and share result.
- Spoiler-safe ShareResultCard.
- Leaderboard shell with season/global tabs and unranked empty state.
- User Profile shell with stats.
- Match History and Match Detail shells.
- Rating History Chart with accessible table fallback.
- Settings with accessibility, gameplay, privacy, notifications, and account deletion sections.

Exit criteria:

- Ranked and casual fixture reports render correctly.
- Settings can reflect token/accessibility mode changes locally.

#### Phase 8: integration readiness pass

Goal: prepare for live API/WebSocket replacement.

Tasks:

- Replace hand-maintained contract types with generated/shared contracts once backend provides them.
- Add API client adapters for live REST endpoints.
- Add Socket.IO event adapters.
- Keep fixtures as story/demo/regression data.
- Add smoke tests for route rendering and fixture scenarios.

Exit criteria:

- Mock/live clients can be selected by environment flag.
- Integration tasks are small swaps instead of screen rewrites.

### 4. Mock/fixture strategy while backend is incomplete

#### Principles

- Fixtures should use backend-shaped data, not UI-only shortcuts.
- Mock responses must use the API envelope from Ticket 02: `{ data, error, requestId }`.
- Mock errors should reuse expected backend codes such as `LOBBY_FULL`, `LOBBY_NOT_FOUND`, `LOBBY_EXPIRED`, `LOBBY_ALREADY_STARTED`, `RANK_REQUIREMENT_NOT_MET`, and `RATE_LIMITED`.
- Socket fixtures should model server-pushed state. Components should render state; they should not invent final scores or feedback.

#### Fixture groups

```text
fixtures/
  users.ts
  settings.ts
  auth.ts
  lobbies.ts
  lobbyEvents.ts
  matchmaking.ts
  matches.ts
  matchEvents.ts
  rounds.ts
  guesses.ts
  reports.ts
  leaderboard.ts
  errors.ts
  scenarios.ts
```

#### Required scenarios

- Anonymous visitor on landing page
- New user registration and onboarding incomplete
- Authenticated user with complete profile
- Empty home dashboard
- User with recent matches
- Quick Join searching
- Quick Join timeout
- Create casual private lobby
- Rated private lobby disabled
- Public lobby list with open lobbies
- Public lobby list empty
- Lobby full during join
- Lobby waiting for players
- Lobby waiting for ready states
- Host settings changed
- Active match round
- Invalid word feedback
- Solved round
- Failed round
- Timed-out round
- Reconnecting during active round
- Reconnected after state resync
- Ranked match report with MMR gain/loss
- Casual match report without MMR
- Empty leaderboard
- Unranked profile
- Account deletion confirmation

#### Mock client approach

- `api-client` exposes the same methods whether using mock or live implementation.
- `realtime-client` exposes subscription-style APIs for lobby and match events.
- Web and mobile consume the same client interfaces.
- Story/previews use fixture scenarios directly.
- Integration work later replaces internals, not screen props.

### 5. Web vs mobile split

#### Shared across web and mobile

- TypeScript domain types
- API envelope and error types
- Socket.IO event types
- Design token source values
- Fixture data and scenarios
- Route names and navigation intent map
- State machine concepts for auth, lobby, match, and connection
- Copy constants for repeated status messages
- Accessibility labels where platform-neutral

#### Web-specific implementation

- Next.js app router pages/layouts.
- SEO-ready public landing page.
- Desktop app shell with side nav.
- Responsive tables for leaderboard/history.
- Physical keyboard gameplay support.
- ARIA live regions for gameplay feedback, reconnect, and lobby ready changes.
- Browser deep links such as `/join/{code}` once route contract is confirmed.
- Web visual regression screenshots.

#### Mobile-specific implementation

- Expo Router route groups.
- Native bottom tabs.
- Safe-area-aware layouts.
- Native share sheet for lobby code and result cards.
- Haptics/sound hooks behind settings flags.
- App foreground/background reconnect handling.
- Large touch targets and portrait-first gameplay.
- React Native accessibility labels/hints.

#### Components that should be separate by platform

- AppShell / MobileTabShell
- Modal vs BottomSheet behavior
- Table vs card list rendering
- GameKeyboard touch implementation
- ShareResult export/share flow
- RatingHistoryChart if chart libraries differ
- Toast/announcement system

#### Components that can share props/contracts

- Button-like prop shape
- Tile feedback enums
- WordGrid data model
- PlayerProgress data model
- Lobby settings model
- Match report model
- Empty/error/loading state copy

### 6. Accessibility testing plan

#### Build-time standards

- Every primitive must define disabled, focus, loading, and error behavior.
- Tile feedback cannot rely on color alone.
- Components must support high contrast and reduced motion tokens.
- Web focus order must match visible layout.
- Touch targets should be at least 44x44 px on mobile.

#### Manual checks

- Keyboard-only web navigation through auth, home, lobby, gameplay, match report, and settings.
- Screen reader pass for:
  - Login/register errors
  - Code input
  - Lobby player ready changes
  - Word grid submitted feedback
  - Invalid word feedback
  - Timer warnings, used sparingly
  - Reconnect/reconnected state
  - Match report result summary
- Colorblind review for tile states and keyboard states.
- High contrast review for gameplay, lobby, and match report.
- Reduced motion review for tile flips, invalid row shake, countdown, score changes, and confetti/celebration.

#### Automated checks

- Web: use axe checks in component previews and key routes.
- Web: unit tests for keyboard input behavior in gameplay shell.
- Mobile: component tests for accessibility labels and role/hint props where tooling supports it.
- Visual tests should include normal, high contrast, colorblind, and reduced-motion snapshots for core surfaces.

#### Accessibility acceptance for first frontend build

- User can complete auth/onboarding/home navigation without mouse.
- User can play a fixture round with physical keyboard on web.
- Screen reader receives meaningful feedback after guess submission.
- Colorblind mode visibly distinguishes correct/present/absent.
- Reduced-motion mode removes shake/flip/confetti-style motion.

### 7. Visual QA plan

#### Component preview strategy

Use Storybook if the stack allows it without slowing setup. If Storybook is too heavy for the first pass, use a local `/dev/components` route in Next.js and a development-only Expo screen.

Preview groups:

- Tokens and themes
- Buttons and inputs
- Cards, badges, banners, toasts
- Tile states and keyboard states
- Lobby states
- Gameplay states
- Match report/share card
- Profile/leaderboard/history states
- Error/empty/loading states

#### Screen visual QA matrix

| Surface | Viewports/states |
|---|---|
| Landing | mobile, tablet, desktop |
| Auth | validation error, loading, reset sent |
| Onboarding | first step, consent step, handle error |
| Home | empty, recent match, rejoinable match |
| Lobby browser | populated, empty, full race error |
| Waiting room | host, non-host, all ready, not enough players |
| Gameplay | active, invalid, solved, failed, timed out, reconnecting |
| Match report | casual, ranked gain, ranked loss, share preview |
| Leaderboard | populated, unranked, empty season |
| Settings | accessibility modes, delete confirmation |

#### Visual QA checks

- Crown Grid Arena tokens are applied consistently.
- Tile states remain readable at mobile sizes.
- Timer and score are visible while typing.
- Mobile keyboard does not cover grid or feedback text.
- Desktop gameplay three-column layout does not crowd the grid.
- High contrast and colorblind variants are not afterthoughts.
- Share card is spoiler-safe and legible in common social preview sizes.

### 8. Dependencies on API contracts

#### REST dependencies from Ticket 02

- Auth:
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/sessions`
  - `DELETE /api/v1/auth/sessions/{sessionId}`
- Current user/profile/settings:
  - `GET /api/v1/me`
  - `PATCH /api/v1/me/profile`
  - `PATCH /api/v1/me/settings`
  - `DELETE /api/v1/me`
- Public profile/history:
  - `GET /api/v1/users/{userId}/profile`
  - `GET /api/v1/users/{userId}/matches?limit=20&cursor=...`
- Lobby:
  - `POST /api/v1/lobbies`
  - `GET /api/v1/lobbies/{lobbyId}`
  - `POST /api/v1/lobbies/{lobbyId}/join`
  - `POST /api/v1/lobbies/join-by-code`
  - `POST /api/v1/lobbies/{lobbyId}/leave`
  - `PATCH /api/v1/lobbies/{lobbyId}`
  - `POST /api/v1/lobbies/{lobbyId}/ready`
  - `POST /api/v1/lobbies/{lobbyId}/start`
  - `GET /api/v1/lobbies?visibility=public&state=waiting...`
- Matchmaking:
  - queue start/cancel/status endpoints from Ticket 02 once finalized in generated contracts.
- Match/report/leaderboard/profile:
  - match detail/report endpoints, leaderboard endpoints, and rating history endpoints from Ticket 02/generated contract once available.

#### Socket.IO dependencies

Frontend needs typed events for:

- Lobby joined/left
- Lobby settings updated
- Player ready changed
- Host transferred
- Lobby starting
- Match initialized
- Round starting
- Round active
- Guess accepted/rejected
- Round player state updated
- Player solved/failed/timed out
- Score updated
- Round ended
- Match completed
- Reconnect/resync state
- Error event with stable code/message

#### Contract decisions needed before live integration

- Exact generated contract source: OpenAPI, shared TypeScript schemas, or another generator.
- Exact Socket.IO event names and payload types.
- Whether route IDs use lobby ID, lobby code, or both.
- Whether mobile and web use the same auth token storage model.
- Error code enum source of truth.
- Consent field names. Decision locks mention `training_insights_opt_in`, while Ticket 02 used `trainingConsent`; the contract should settle naming.

### 9. Follow-up coding tickets

#### Ticket: Set up frontend workspace and shared package boundaries

- Target agent: Luna
- Why that agent is needed: This is frontend foundation work.
- Exact task: Create the initial web/mobile/shared package structure, TypeScript config, route constants, and placeholder app shells.
- Inputs/context they need: Ticket 12 plan, repo tooling choice, package manager decision.
- Expected output back to Athena: Workspace files, bootable placeholder web/mobile apps, commands run with exit codes.

#### Ticket: Implement Crown Grid Arena design tokens

- Target agent: Luna
- Why that agent is needed: Frontend components need concrete brand tokens before screen work.
- Exact task: Implement color, typography, spacing, radius, shadow, motion, tile, rank, colorblind, high-contrast, and reduced-motion tokens.
- Inputs/context they need: Ticket 09 branding response, Athena decision locks, Ticket 12 plan.
- Expected output back to Athena: Token package/files, preview evidence, contrast notes.

#### Ticket: Implement shared primitive component set

- Target agent: Luna
- Why that agent is needed: Core UI primitives unblock all frontend screens.
- Exact task: Build Button, TextInput, CodeInput, Toggle, Select, Modal/Drawer, Toast, Banner, Card, Tabs, Skeleton, EmptyState, ErrorState, Avatar, Badge, CountdownTimer, and tile primitives.
- Inputs/context they need: Design tokens, accessibility requirements, Ticket 03 UX plan.
- Expected output back to Athena: Components, previews, accessibility notes, tests/commands run.

#### Ticket: Implement frontend fixtures and mock clients

- Target agent: Luna
- Why that agent is needed: Frontend screens must progress before backend is live.
- Exact task: Build REST and Socket.IO mock clients plus fixture scenarios for auth, lobbies, matchmaking, gameplay, reports, leaderboards, settings, and error states.
- Inputs/context they need: Ticket 02 API contract, Ticket 10 amendments if available, Ticket 12 fixture strategy.
- Expected output back to Athena: Fixture files, mock client interfaces, scenario list, verification evidence.

#### Ticket: Implement web and mobile app shell/navigation

- Target agent: Luna
- Why that agent is needed: Navigation structure is frontend-specific and blocks screen implementation.
- Exact task: Build public/auth/authenticated/gameplay shells for web and mobile, including route guards driven by mock auth/profile state.
- Inputs/context they need: Ticket 03 navigation map, Ticket 12 route plan, fixture auth state.
- Expected output back to Athena: Navigable shells and screen placeholders, commands run with exit codes.

#### Ticket: Implement auth, onboarding, and home dashboard shells

- Target agent: Luna
- Why that agent is needed: These are first-run product screens.
- Exact task: Build login/register/forgot password, onboarding, display name/handle setup, consent, and home dashboard shells using mock clients.
- Inputs/context they need: Auth/profile contracts, consent defaults, design system primitives.
- Expected output back to Athena: Screens, validation states, mock flow evidence.

#### Ticket: Implement lobby screens with mock data

- Target agent: Luna
- Why that agent is needed: Lobby UX is core frontend behavior.
- Exact task: Build Quick Join, Create Lobby, Join by Code, Public Lobby Browser, Waiting Room, and Host Settings Panel with mocked lobby states and errors.
- Inputs/context they need: Lobby API contract, fixture scenarios, design system primitives.
- Expected output back to Athena: Screens and state demos with loading/error/empty coverage.

#### Ticket: Implement gameplay UI shell with fixtures

- Target agent: Luna
- Why that agent is needed: Gameplay is the highest-value frontend surface.
- Exact task: Build fixture-driven gameplay UI including grid, keyboard, timer, score, player progress, invalid word, solved, failed, timed out, and reconnect states.
- Inputs/context they need: Match state contract, Socket.IO event contract, Ticket 03 gameplay requirements.
- Expected output back to Athena: Gameplay shell and scenario evidence without local authoritative game logic.

#### Ticket: Implement report/profile/leaderboard/settings shells

- Target agent: Luna
- Why that agent is needed: These screens complete the first frontend loop.
- Exact task: Build Match Report, Share Result Card, Leaderboard, Profile, Match History, Rating History, Settings, and Account Deletion shells.
- Inputs/context they need: Fixture reports, rating/history contract, design system primitives.
- Expected output back to Athena: Responsive shells with empty/loading/error states.

#### Ticket: Accessibility and visual QA pass for frontend foundation

- Target agent: Jasmine
- Why that agent is needed: Independent QA should verify foundations before feature expansion.
- Exact task: Review design tokens, primitives, navigation, gameplay fixture states, colorblind mode, high contrast, reduced motion, keyboard support, and screen reader announcements.
- Inputs/context they need: Implemented frontend foundation, Ticket 03 accessibility notes, Ticket 12 QA plan.
- Expected output back to Athena: Pass/fail matrix with reproduction steps and required fixes.

### 10. Parallelization notes

Can run in parallel after Ticket 12 approval:

- Design tokens and primitive components can start while mock clients are being built, as long as token names are stable.
- Fixture/mock client work can run in parallel with app shell route setup.
- Web and mobile shells can be built in parallel once shared route names and token package exist.
- Auth/onboarding/home shells can begin before lobby/gameplay if primitives and mock auth state exist.
- Lobby screens and gameplay shell should share the same connection status and realtime mock patterns, so coordinate their event naming.
- Match report/profile/leaderboard can start after report/rating fixtures exist; they do not need live gameplay.
- Jasmine accessibility review can start as soon as primitives and gameplay fixture states exist, not only after all screens are done.

Recommended sequencing:

```text
1. Workspace + contracts skeleton
2. Tokens + primitives + fixture/client skeleton in parallel
3. App shell/navigation
4. Auth/onboarding/home
5. Lobby screens + gameplay shell in parallel
6. Match report/profile/leaderboard/settings
7. Accessibility + visual QA hardening
8. Live API/Socket.IO integration
```

## Open Questions

1. What package manager should the project standardize on: pnpm, npm, yarn, or another tool?
2. Should component previews use Storybook, a lightweight local `/dev/components` route, or both?
3. Is the frontend repo already initialized, or should Luna create the initial Next.js/Expo workspace in the next coding ticket?
4. Should web and mobile share a styling solution such as Tamagui/NativeWind, or should we keep platform-native styling with shared tokens only?
5. What is the final generated contract approach: OpenAPI, shared Zod schemas, ts-rest, tRPC-style contracts, or Nest-generated Swagger?
6. Should app icon/logo assets be created before the first app shell, or can the first shell use placeholder brand assets?
7. Should account deletion/data export screens be functional in the first frontend foundation pass or shell-only until backend privacy endpoints are ready?

## Follow-up Tickets

### Ticket: Set up frontend workspace and shared package boundaries

- Target agent: Luna
- Why that agent is needed: Establishes the frontend foundation for web, mobile, shared contracts, fixtures, and tokens.
- Exact task: Create the initial workspace structure for `apps/web`, `apps/mobile`, `packages/design-tokens`, `packages/contracts`, `packages/fixtures`, `packages/api-client`, `packages/realtime-client`, and shared config.
- Inputs/context they need: Ticket 12 plan, Athena package manager decision, current repo state.
- Expected output back to Athena: Bootable placeholder apps or documented blocker, changed files, commands run with exit codes.

### Ticket: Implement Crown Grid Arena tokens and primitive previews

- Target agent: Luna
- Why that agent is needed: Frontend screens need the locked brand and accessibility tokens.
- Exact task: Implement design tokens and a component preview surface for buttons, inputs, cards, tile states, badges, banners, skeletons, and error/empty states.
- Inputs/context they need: Ticket 09 branding response, Athena decision locks, Ticket 03 accessibility requirements.
- Expected output back to Athena: Token/component files, preview path, visual verification notes.

### Ticket: Define generated frontend/backend contract workflow

- Target agent: Elisa
- Why that agent is needed: Architecture/API owner must choose the contract source of truth to prevent drift.
- Exact task: Decide and document whether frontend contracts come from OpenAPI, shared TypeScript schemas, Zod, Nest Swagger, or another mechanism; include generation commands and ownership.
- Inputs/context they need: Ticket 02 API contract, Ticket 10 amendments, Ticket 12 dependency section.
- Expected output back to Athena: Contract workflow decision and implementation ticket for generated clients.

### Ticket: Build mock REST and Socket.IO clients

- Target agent: Luna
- Why that agent is needed: Frontend feature screens need stable mocked data while backend is incomplete.
- Exact task: Create fixture-driven REST and realtime clients that mirror the API envelope, error codes, lobby events, match events, timer/reconnect states, and report data.
- Inputs/context they need: Ticket 02 API contract, Ticket 12 mock strategy, locked product defaults.
- Expected output back to Athena: Mock client files, scenario list, tests/verification evidence.

### Ticket: Implement app shell and navigation skeletons

- Target agent: Luna
- Why that agent is needed: Routes and layout unblock all screen work.
- Exact task: Build public/auth/authenticated/gameplay shells for web and mobile with route guards from mock auth/profile state.
- Inputs/context they need: Ticket 03 navigation map, Ticket 12 app shell plan, fixture auth state.
- Expected output back to Athena: Navigable shell, screenshots or route verification, commands run with exit codes.

### Ticket: Accessibility foundation review

- Target agent: Jasmine
- Why that agent is needed: Accessibility should be independently verified before screen work scales.
- Exact task: Review token contrast, colorblind tile states, reduced motion behavior, focus states, keyboard navigation patterns, and screen reader announcement strategy.
- Inputs/context they need: Implemented tokens/primitives, Ticket 03 accessibility notes, Ticket 12 accessibility plan.
- Expected output back to Athena: Accessibility report with required fixes and severity.

### Ticket: Confirm frontend package/styling choices

- Target agent: Athena or Elisa
- Why that agent is needed: The team needs a decision before implementation tickets create churn.
- Exact task: Decide package manager, preview tool, styling approach, and generated contract workflow.
- Inputs/context they need: Ticket 12 open questions, repo constraints, deployment/tooling preferences.
- Expected output back to Athena: Decision lock update for frontend implementation.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-12-luna-frontend-design-system-implementation-plan-response.md`

## Tests / Commands Run

None — planning/spec task only. No shell commands or project tests were run.

## Evidence / Result

- Read the assigned ticket: `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/tickets/ticket-12-luna-frontend-design-system-implementation-plan.md`.
- Reviewed Athena decision locks: `/home/ashar/Desktop/hermes-projects/wordle-royale/docs/2026-06-22-athena-decision-locks-after-tickets-01-10.md`.
- Reviewed Ticket 03 UX response: `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-03-luna-ux-flow-wireframe-plan-response.md`.
- Reviewed relevant Ticket 02 API contract content: `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-02-elisa-architecture-api-response.md`.
- Created the requested response file in `agent-communication/responses/`.
- The response covers proposed folder/package structure, design system component list, implementation phases, mock/fixture strategy, web/mobile split, accessibility testing, visual QA, API dependencies, follow-up coding tickets, and parallelization notes.

## Risks / Blockers

- The actual frontend repository/tooling may not exist yet. The next coding ticket should confirm or create the workspace.
- Package manager, preview tool, styling approach, and generated contract workflow are still open decisions.
- API and Socket.IO contracts need a generated or shared source of truth before live integration.
- The consent field naming should be reconciled before implementation: decision locks use `training_insights_opt_in`, while Ticket 02 used `trainingConsent`.
- This ticket produced an implementation plan only; no UI components, apps, mocks, or tests were implemented.
