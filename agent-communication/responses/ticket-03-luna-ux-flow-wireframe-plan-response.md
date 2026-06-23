# Ticket 3 — UX Flow and Wireframe Plan — Response

## Summary

Created the UX flow and wireframe-level screen plan for Wordle Royale across web and mobile. The plan covers public entry, authentication, onboarding, consent, home, lobby flows, live gameplay, round transitions, match reports, profile/history/rating surfaces, settings, privacy controls, and required edge states.

This is a planning/spec response. No app code was changed.

## Decisions / Recommendations

- Treat Wordle Royale as competitive by default, but keep casual play fast and friendly.
- Use one shared UX model across Next.js web and Expo React Native, with platform-specific layouts where needed.
- Keep gameplay server-authoritative in the UI: visible timer, connection status, locked submission states, and reconnect/resync messaging.
- Put privacy and analytics consent in first-run onboarding, then expose the same controls later in Settings.
- Build accessibility into the first UI pass: colorblind mode, high contrast, reduced motion, keyboard input, and screen reader feedback.
- Make lobby sharing prominent. Multiplayer growth depends on how quickly a host can invite friends.
- Show rating/MMR only in rated contexts. Casual players should not feel punished or over-measured.
- Include loading, empty, error, and reconnect states in the first frontend implementation tickets.

## Detailed Output

### Full screen inventory

#### Public and account screens

1. Public landing page
2. Login
3. Register
4. Forgot password
5. Password reset confirmation
6. First-run onboarding intro
7. Display name / handle setup
8. Privacy and analytics consent
9. Terms / community rules acknowledgment

#### Authenticated app screens

10. Home dashboard
11. Quick Join
12. Create Lobby
13. Join by Code
14. Public Lobby Browser
15. Lobby Waiting Room
16. Host Settings Panel
17. Real-Time Gameplay
18. Round Transition
19. Match Report
20. Rematch Waiting Room

#### Competitive, profile, and settings screens

21. Leaderboard
22. User Profile
23. Match History
24. Match Detail
25. Rating History Graph
26. Settings
27. Account deletion / privacy controls
28. Notification preferences
29. Help / rules / scoring explanation

#### System and edge states

30. Global loading shell
31. Route-level skeleton state
32. Empty dashboard state
33. Empty lobby browser state
34. Invalid lobby code state
35. Lobby full state
36. Match already started state
37. Host left / host transferred state
38. Kicked or removed from lobby state, if supported
39. WebSocket reconnect banner
40. Reconnected / state resynced toast
41. Offline blocking screen
42. Server maintenance screen
43. Generic error boundary
44. Rate limit / too many attempts state
45. Account deletion confirmation state

### Navigation map

```text
Public Landing
  -> Login
  -> Register
  -> Join by Code, if opened from invite link

Login / Register
  -> First-run Onboarding, if profile incomplete
  -> Home Dashboard, if profile complete

First-run Onboarding
  -> Display Name / Handle Setup
  -> Privacy and Analytics Consent
  -> Home Dashboard

Home Dashboard
  -> Quick Join
  -> Create Lobby
  -> Join by Code
  -> Public Lobby Browser
  -> Leaderboard
  -> User Profile
  -> Match History
  -> Settings

Quick Join
  -> Matchmaking Waiting State
  -> Lobby Waiting Room or Real-Time Gameplay
  -> No Match Found Recovery State

Create Lobby
  -> Lobby Waiting Room as host
  -> Host Settings Panel

Join by Code
  -> Lobby Waiting Room
  -> Invalid / Full / Started / Expired states

Public Lobby Browser
  -> Lobby Waiting Room
  -> Lobby Full or Started recovery state

Lobby Waiting Room
  -> Host Settings Panel, host only
  -> Real-Time Gameplay
  -> Home Dashboard, if player leaves

Real-Time Gameplay
  -> Round Transition
  -> Match Report after final round

Round Transition
  -> Real-Time Gameplay for next round
  -> Match Report after final round

Match Report
  -> Rematch Waiting Room
  -> Share Result
  -> Match Detail
  -> Home Dashboard

Leaderboard
  -> User Profile

User Profile
  -> Match History
  -> Rating History Graph
  -> Match Detail

Settings
  -> Privacy Controls
  -> Account Deletion
  -> Notification Preferences
```

### Primary user flows

#### New player starts first match

1. Player opens landing page.
2. Player selects Play Now.
3. Player registers or logs in.
4. Player sets display name and handle.
5. Player reviews privacy and analytics consent.
6. Player lands on Home Dashboard.
7. Player taps Quick Join.
8. System places player into a lobby or matchmaking wait state.
9. Player marks ready, if the lobby requires ready checks.
10. Match starts.
11. Player completes timed rounds.
12. Player sees Match Report and can rematch, share, or return home.

#### Host creates private lobby

1. Host selects Create Lobby.
2. Host chooses visibility, rated/unrated, difficulty, rounds, timer, and player count.
3. Host enters Lobby Waiting Room.
4. Host copies or shares the lobby code.
5. Other players join.
6. Host sees ready states and start eligibility.
7. Host starts match once requirements are met.

#### Player joins by code

1. Player selects Join by Code or opens invite link.
2. Player enters or confirms code.
3. System validates lobby.
4. Player enters waiting room if valid.
5. If invalid, full, expired, or started, UI gives a specific reason and recovery action.

#### Ranked session

1. Player selects ranked Quick Join or a rated lobby.
2. UI confirms that match affects rating.
3. Lobby shows rated indicator, ranked-compatible settings, difficulty, timer, rounds, and player count.
4. Gameplay emphasizes timer, score, placement, and player progress.
5. Match Report shows placement, score, per-round breakdown, and MMR/rating delta.
6. Player can inspect rating history from profile.

#### Reconnect during active match

1. Client loses WebSocket connection.
2. UI keeps board visible but disables input after a short grace period.
3. Banner says the client is reconnecting and will resync.
4. Client reconnects and fetches authoritative match state.
5. UI shows reconnected toast and resumes input if the round is still active.
6. If round expired while offline, UI shows timed-out or round-ended state.

### Wireframe descriptions for major screens

#### Public landing page

Purpose: explain the product and route players into play.

Desktop structure:

```text
[Header: Logo | How it works | Leaderboard | Login | Play now]
[Hero: Wordle Royale | Competitive multiplayer word battles]
[CTA: Play now] [Create private lobby]
[Mode cards: Quick Join | Private Lobby | Ranked]
[How it works: Guess -> Race -> Score -> Climb]
[Footer: Terms | Privacy | Support]
```

Mobile structure:

```text
[Logo] [Menu]
[Hero title]
[Primary CTA: Play now]
[Secondary CTA: Join with code]
[Mode cards stacked]
[How it works accordion]
```

#### Login / register / forgot password

```text
[Logo]
[Auth card]
Email
Password
[Continue]
[Forgot password]
[Switch login/register]
[Legal copy]
```

States: loading submit, validation errors, wrong password, email already used, reset email sent, rate limited.

#### First-run onboarding

Suggested steps:

1. Multiplayer Wordle basics
2. Scoring and timed rounds
3. Ranked versus casual
4. Display name / handle setup
5. Privacy and analytics consent

Keep this short. Use cards, progress indicator, and a skip option only for non-required education steps.

#### Display name / handle setup

```text
[Progress]
Display name
Handle
[Availability status]
[Avatar preview]
[Continue]
```

Rules: display name can be non-unique, handle should show uniqueness and allowed characters, and the preview should show how the player appears in a lobby.

#### Privacy and analytics consent

```text
[Required gameplay/account data explanation]
[Optional product analytics toggle]
[Optional personalized insights/training toggle, if included]
[Continue]
[Manage later in Settings]
```

Use plain language and avoid preselecting optional consent unless approved by legal/product.

#### Home dashboard

Desktop:

```text
[Left nav]
[Top bar: user, status]
[Main: Welcome + primary actions]
Quick Join | Create Lobby | Join by Code | Browse Public Lobbies
[Rating card]
[Recent matches]
[Active/rejoinable match]
```

Mobile:

```text
[Top: logo + profile]
[Rating / recent status card]
[Large Quick Join button]
[Create Lobby] [Join Code]
[Public Lobbies]
[Recent Matches]
[Bottom tab nav]
```

#### Quick Join

```text
Choose mode: Casual / Ranked
Difficulty: Any / Easy / Medium / Hard
[Find match]
[Cancel while searching]
```

Recovery states: no match found, ranked unavailable, queue timeout, duplicate queue attempt.

#### Create Lobby

```text
Visibility: Public / Private
Mode: Casual / Rated
Difficulty
Rounds
Timer
Max players
[Create Lobby]
```

Default recommendation: private, casual, medium difficulty, 3 rounds, 90 seconds, 2-4 players.

#### Join by Code

```text
[Code input]
[Paste]
[Join]
```

States: invalid code, lobby full, expired lobby, match already started, rank requirement not met.

#### Public Lobby Browser

Desktop:

```text
[Filters: mode, difficulty, rounds, timer, slots, rated]
[List/table]
Lobby | Host | Players | Difficulty | Rounds | Timer | Rated | Join
```

Mobile: stacked lobby cards with Join button.

#### Lobby Waiting Room

Required elements:

- Lobby code and share action
- Player list
- Ready states
- Host indicator
- Public/private visibility
- Rated/unrated indicator
- Difficulty, rounds, timer, player count
- Host start button
- Clear waiting status

Wireframe:

```text
Lobby ABC123 [Copy] [Share]
Private | Casual | Medium | 3 rounds | 90 sec | 3/4 players

Players
- Ashar [Host] [Ready]
- Maya [Ready]
- Ken [Not ready]

Status: Waiting for Ken to ready up.
[Ready / Unready]
[Leave]
[Host: Start Match] disabled until ready
```

#### Host Settings Panel

```text
[Drawer / side panel]
Visibility
Rated/unrated
Difficulty
Rounds
Timer
Max players
[Save]
[Cancel]
```

If settings change, ready states should likely reset or show a confirmation message.

#### Real-Time Gameplay screen

Required elements:

- Word grid
- Keyboard
- Timer
- Round number
- Current score
- Player progress panel
- Connection/reconnect status
- Invalid word feedback
- Solved, failed, and timed-out states

Desktop:

```text
[Top bar: Round 2/5 | 00:42 | Score 1,240 | Live]

[Left: Player progress]
Player A: 3 guesses, active
Player B: solved in 4
Player C: timed out

[Center: Word grid]
[ ][ ][ ][ ][ ]
[ ][ ][ ][ ][ ]
[ ][ ][ ][ ][ ]
[ ][ ][ ][ ][ ]
[ ][ ][ ][ ][ ]
[ ][ ][ ][ ][ ]

[Feedback line]
[Keyboard]

[Right: match settings / placement projection]
```

Mobile:

```text
[Compact top bar: R2/5 | 00:42 | 1,240 | Live]
[Horizontal player progress strip]
[Word grid]
[Feedback line]
[Keyboard fixed bottom]
```

Gameplay states:

- Active: input enabled.
- Invalid word: text feedback plus optional row shake if reduced motion is off.
- Submitted: row locks after server confirmation.
- Solved: board locks, show solve time and waiting state.
- Failed: show failed state and reveal word only when server policy allows.
- Timed out: input disabled, show Time's up.
- Reconnecting: input disabled after grace period and resync message visible.

#### Round Transition

```text
Round 2 complete
Word: CRANE

Round standings
1. Player A — solved in 3, 00:31, +540
2. Player B — solved in 4, 00:48, +390
3. Player C — timed out, +0

Next round starts in 8...
```

#### Match Report

Required elements:

- Final placement
- Total score
- Per-round breakdown
- Guess counts
- Solve times
- Rating/MMR change if rated
- Rematch action
- Share result action

Wireframe:

```text
You placed 2nd
Total score: 3,820
Rated: +14 MMR, now 1,284

[Rematch] [Share result] [Back home]

Final standings
Rank | Player | Score | Solved | Avg guesses | Avg time | MMR

Per-round breakdown
Round | Word | Result | Guesses | Time | Score delta | Placement
```

#### Leaderboard

```text
[Tabs: Global | Weekly | Season | Difficulty]
[Your rank card]
[Table: Rank | Player | MMR | Matches | Win rate | Streak]
```

Empty state: user is unranked and can start ranked play.

#### User Profile

```text
[Avatar | Display name | @handle | Rating | Rank]
[Stats grid: matches, win rate, avg guesses, avg time]
[Tabs: Overview | Match history | Rating history]
```

#### Match History and Match Detail

History list:

```text
Date | Mode | Rated | Placement | Score | MMR change | View
```

Detail page: final standings, per-round breakdown, personal board results, and disconnect notes if relevant.

#### Rating History Graph

```text
Current MMR
Peak MMR
Season
[Line chart]
[Recent rating changes]
```

Include table fallback for accessibility.

#### Settings and privacy controls

Sections:

- Account
- Gameplay
- Accessibility
- Privacy and consent
- Notifications
- Danger zone

Account deletion should require confirmation and explain what is deleted, retained, or anonymized.

### Mobile layout notes

- Use bottom tabs for Home, Play, Leaderboard, History, and Profile/Settings.
- Hide standard app navigation during live gameplay.
- Keep the gameplay keyboard fixed to the bottom and resize the grid above it.
- Use horizontal progress strips instead of desktop side panels.
- Lobby code sharing should use the native share sheet in Expo.
- Primary touch targets should be at least 44x44 px.
- Support safe areas, notches, dynamic type, and portrait-first gameplay.
- Avoid hover-only affordances.

### Web layout notes

- Use a responsive app shell with left navigation on desktop.
- Gameplay can use three columns on desktop: player progress, board, match info.
- Lobby and report screens can use side panels for settings and summaries.
- Gameplay must support physical keyboard input.
- Public landing page should be fast and indexable.
- Invite links should deep-link into join flow, likely `/join/{code}` or the route Elisa/Athena approves.

### Component boundaries

#### Shared design system components

- Button
- IconButton
- TextInput
- CodeInput
- Toggle
- Select
- SegmentedControl
- Modal
- Drawer
- Toast
- Banner
- Card
- Tabs
- Table
- Skeleton
- EmptyState
- ErrorState
- Avatar
- Badge
- Tooltip
- CountdownTimer
- ProgressBar

#### Product components

- AppShell
- PublicHeader
- AuthCard
- OnboardingStepper
- ConsentPanel
- HomeActionGrid
- RatingSummaryCard
- QuickJoinPanel
- LobbySettingsForm
- LobbyCodeShare
- PlayerList
- PlayerReadyRow
- HostControls
- LobbyStatusBanner
- WordGrid
- WordGridRow
- GameKeyboard
- KeyboardKey
- RoundStatusBar
- PlayerProgressPanel
- ConnectionStatusBanner
- InvalidWordFeedback
- RoundResultSummary
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

#### State boundaries

- Auth/session state
- Profile completion state
- Consent state
- Lobby state
- Match state
- WebSocket connection state
- Leaderboard state
- Match history state
- Settings/privacy state

Game components should render server-derived state and emit player intents. They should not calculate authoritative results locally.

### Loading, error, empty, and reconnect states

#### Loading

- Initial app load: branded shell or skeleton.
- Auth check: minimal blocking state, then route to onboarding or dashboard.
- Route data: skeleton cards matching final layout.

#### Empty

- No recent matches: prompt Quick Join.
- No public lobbies: prompt Create Lobby and clear filters.
- No leaderboard season: explain season status.
- No rating history: prompt ranked match.

#### Error

- Auth failure: field-specific message where possible.
- Invalid lobby code: keep entered code and offer retry.
- Lobby full: offer Browse Public Lobbies or Quick Join.
- Match already started: offer spectate only if supported; otherwise return to browser.
- Server unavailable: retry and status copy.
- Generic error boundary: reload and home actions.

#### Reconnect

- Passive banner: "Connection unstable. Trying to reconnect..."
- Input lock: "Reconnecting. Input paused until your board resyncs."
- Success toast: "Reconnected. Match state updated."
- Failure: "Could not reconnect." Actions: Retry, Return home.
- Do not queue guesses during reconnect unless backend explicitly supports it.

### Accessibility notes

#### Colorblind support

- Do not rely only on green/yellow/gray.
- Add secondary indicators: icon, pattern, border, or label.
- Keyboard keys must use the same non-color indicators as grid tiles.
- Provide colorblind palettes in Settings.

#### High contrast

- Provide a high-contrast theme.
- Timer, invalid word feedback, and connection state must meet contrast requirements.
- Critical text should be readable on both light and dark backgrounds.

#### Reduced motion

- Replace tile flips, row shakes, confetti, and score bursts with fades or instant updates.
- Invalid word feedback must always include text.
- Countdown animation should be calm.

#### Keyboard and screen reader

- Web gameplay must support physical keyboard input.
- Focus order should follow visible layout.
- On-screen keyboard keys need accessible labels.
- Word grid should announce submitted feedback without repeatedly reading empty cells.
- Use ARIA live regions for invalid word, guess submitted, solved state, reconnect status, and round transition.
- Lobby player ready changes should be announced politely.

### UX recommendations for ranked/competitive feel

- Use precise labels: Rated, MMR, placement, score, round count, timer.
- Confirm rating impact before ranked entry.
- Lock and display ranked settings once the match starts.
- Keep gameplay calm and readable. Competitive screens should favor clarity over decoration.
- Show score and placement, but avoid revealing other players' hidden answers.
- Explain rating changes in Match Report.
- Consider season framing: current rank, peak rating, recent trend, and leaderboard position.

### UX recommendations for casual lobby feel

- Make invite sharing obvious.
- Keep private lobby creation to one or two taps with good defaults.
- Use human status copy, such as "Waiting for Maya to ready up."
- De-emphasize MMR in casual screens.
- Make rematch the primary post-match action.
- Keep share results spoiler-safe.

## Open Questions

1. Are guest players allowed, or must every player register before joining?
2. What is the final scoring formula?
3. Which rating algorithm will be used for multiplayer rated matches?
4. Are rated private lobbies allowed?
5. Will launch include friends, parties, spectators, or chat?
6. Is launch fixed to five-letter words, or will word length vary by difficulty/mode?
7. Should public landing page show a live leaderboard before login?
8. What exact data export/deletion behavior is required for privacy compliance?

## Follow-up Tickets

### Ticket: Implement shared frontend design system primitives

- Target agent: Luna
- Why that agent is needed: The frontend needs reusable UI primitives before feature screens are built.
- Exact task: Build Button, TextInput, CodeInput, Toggle, Select, Modal/Drawer, Toast, Card, Tabs, Skeleton, EmptyState, ErrorState, Badge, Avatar, and CountdownTimer components.
- Inputs/context they need: This UX plan, architecture/API contract, frontend repo structure.
- Expected output back to Athena: Component files, usage examples, accessibility notes, tests/commands run.

### Ticket: Implement auth and first-run onboarding screens

- Target agent: Luna
- Why that agent is needed: This is product-facing frontend work.
- Exact task: Build login, register, forgot password, onboarding intro, handle setup, and privacy/analytics consent screens.
- Inputs/context they need: Auth/profile APIs, privacy requirements, design system primitives.
- Expected output back to Athena: Implemented screens, validation behavior, files changed, verification evidence.

### Ticket: Implement lobby flows

- Target agent: Luna
- Why that agent is needed: Lobby creation and joining are core frontend flows.
- Exact task: Build Quick Join, Create Lobby, Join by Code, Public Lobby Browser, Lobby Waiting Room, and Host Settings Panel UI states.
- Inputs/context they need: Lobby API contract, WebSocket lobby events, design system primitives.
- Expected output back to Athena: Lobby screens with loading/error/empty states and verified behavior against mocks or backend endpoints.

### Ticket: Implement real-time gameplay UI shell

- Target agent: Luna
- Why that agent is needed: Gameplay is the core product surface.
- Exact task: Build WordGrid, GameKeyboard, RoundStatusBar, PlayerProgressPanel, ConnectionStatusBanner, InvalidWordFeedback, solved/failed/timed-out states, and reconnect UI behavior.
- Inputs/context they need: Match state schema, guess submission contract, scoring schema, accessibility requirements.
- Expected output back to Athena: Gameplay UI components, state fixtures, tests for input/feedback states, verification evidence.

### Ticket: Implement post-match and competitive history screens

- Target agent: Luna
- Why that agent is needed: These screens carry the ranked and replay loop.
- Exact task: Build Match Report, Share Result, Leaderboard, User Profile, Match History, Match Detail, and Rating History Graph screens.
- Inputs/context they need: Match report API, leaderboard API, rating history API, scoring/rating explanation copy.
- Expected output back to Athena: Responsive screens with loading/error/empty states and verification evidence.

### Ticket: Define scoring and rating explanation copy

- Target agent: Elisa
- Why that agent is needed: Scoring/rating semantics require product and architecture decisions.
- Exact task: Produce user-facing rules for score calculation, rating/MMR changes, disconnect penalties, and ranked eligibility.
- Inputs/context they need: PRD, scoring/rating design, this UX plan.
- Expected output back to Athena: Approved rules/copy for ranked entry, Match Report, and Help screens.

### Ticket: Verify accessibility and edge states

- Target agent: Jasmine
- Why that agent is needed: Independent QA should verify critical accessibility and edge behavior.
- Exact task: Test colorblind mode, high contrast, reduced motion, keyboard-only gameplay, screen reader labels, reconnect, invalid word feedback, lobby full/invalid/started states, and account deletion confirmation.
- Inputs/context they need: Implemented frontend build, this UX plan, acceptance criteria.
- Expected output back to Athena: QA report with pass/fail results and reproduction steps.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-03-luna-ux-flow-wireframe-plan-response.md`

## Tests / Commands Run

No project tests run — planning/spec task only.

## Evidence / Result

- Created the requested Markdown response file in `agent-communication/responses/`.
- The response includes the required screen inventory, navigation map, primary flows, wireframe descriptions, mobile/web notes, component boundaries, edge states, accessibility notes, competitive/casual UX recommendations, and frontend follow-up tickets.

## Risks / Blockers

- Final scoring, rating, guest access, spectating, and privacy retention details remain open.
- Reconnect behavior must match backend guarantees before implementation.
- Mobile and web can share UX structure, but Expo React Native and Next.js will still need platform-specific implementations.
