# Ticket 01 — Product Requirements Document — Response

## Summary

Created a launch-grade Product Requirements Document (PRD) for **Wordle Royale**, a mobile + web multiplayer competitive Wordle-style game. The PRD defines the product scope, user journeys, lifecycle requirements, ranked/unranked behavior, profile/statistics expectations, word-library requirements, analytics/privacy requirements, edge cases, and follow-up work for Athena and the specialist agents.

This is a planning/specification deliverable. No application code was implemented.

## Decisions / Recommendations

1. **Launch positioning:** Treat Wordle Royale as a production multiplayer game, not a quick MVP.
2. **Core game mode:** Start with standard 5-letter Wordle-style competitive rounds, while designing data/contracts so future modes are not blocked.
3. **Account requirement:** Require registered accounts for ranked play, profiles, moderation, and leaderboards.
4. **Lobby model:** Support private lobbies, public lobbies, join-by-code, lobby browser, and quick join/random matchmaking.
5. **Game authority:** Gameplay, scoring, timer, word validation, and rated outcomes should be server-authoritative.
6. **Ranked system:** Include ranked/rated games and leaderboards at launch, but defer exact rating algorithm choice to architecture/product decision.
7. **Privacy-first analytics:** Separate necessary gameplay data from optional analytics/training/insight data.
8. **Admin/moderation:** Include basic admin and moderation tooling before launch because ranked public leaderboards create abuse and integrity risks.
9. **Scope control:** Defer chat, friends/social graph, tournaments, custom word packs, monetization, and advanced variants unless Ashar explicitly elevates them.

## Detailed Output

# Wordle Royale — Product Requirements Document

## 1. Product Summary

Wordle Royale is a competitive multiplayer Wordle-style game for mobile and web. Players create or join lobbies, compete in timed word-guessing rounds, earn scores based on accuracy/guess count/speed, and build long-term progression through profiles, match history, ratings, and leaderboards.

The product must support:

- Account creation and login
- Cross-platform web + mobile gameplay
- Private and public multiplayer lobbies
- Join-by-code and shareable lobby links
- Quick/random matchmaking
- Configurable lobby rules
- Real-time or near-real-time competitive rounds
- Ranked and unranked play
- Scoring, match reports, match history, and statistics
- Word library with difficulty levels and moderation
- Leaderboards and rating/MMR
- Privacy-aware analytics and data collection
- Admin/moderation capabilities
- Future game modes and variants

## 2. Product Goals

### Primary Goals

1. Deliver a polished competitive Wordle-style multiplayer experience.
2. Support both casual and ranked play.
3. Make lobby creation, joining, matchmaking, and replayability frictionless.
4. Provide meaningful progression through stats, ratings, profiles, and leaderboards.
5. Build a data foundation for analytics, balance tuning, anti-cheat, and future insight/training use cases.
6. Be ready for production launch across mobile and web.

### Non-goals for Initial Launch

Plan for these later, but do not include them in launch scope unless Ashar explicitly approves:

- Real-money tournaments
- Team/clan systems
- Full social graph/friends list
- User-generated word packs
- In-game free-text chat
- Advanced AI coaching
- Spectator mode
- Large battle royale modes with many players
- Monetization, subscriptions, or cosmetics

## 3. Target Platforms

### Must-have

- Responsive web app
- Mobile app support for iOS and Android
- Shared account system across web/mobile
- Consistent gameplay rules across all platforms

### Should-have

- Deep links for joining lobbies by code/link
- Push notifications for invites, match starts, and reminders
- App background/reconnect handling
- Mobile-friendly one-handed gameplay
- Tablet support

### Later

- Native desktop wrapper
- Offline practice mode
- Companion notifications/widgets

## 4. User Types

### Anonymous Visitor

Can view landing page and public information. May access a limited tutorial/demo if product approves anonymous play.

### Registered Player

Can create a profile, join lobbies, play unranked/ranked matches, view stats, and appear on leaderboards.

### Host

A player who creates a lobby and controls configurable lobby settings before match start.

### Moderator/Admin

Can review suspicious activity, manage word lists, moderate usernames/display names, inspect matches, resolve reports, and apply account restrictions.

## 5. Core User Journeys

### 5.1 Register/Login

1. User opens app/web.
2. User chooses register/login.
3. User creates account using approved auth method.
4. User verifies email or completes required identity step if enabled.
5. User chooses display name/handle.
6. User completes onboarding.
7. User lands on home dashboard.

Requirements:

- Durable account identity.
- Secure password or OAuth-based login.
- Password reset and session management.
- Independent web/mobile session handling.
- Display names can be non-unique; handles should be unique if adopted.

### 5.2 Onboarding

The prompt references **Onboarding (1/9)**. Interpret this as a possible 9-step onboarding flow unless Ashar clarifies otherwise.

Recommended onboarding sequence:

1. Welcome/product explanation
2. Display name/handle setup
3. Wordle rules
4. Multiplayer round explanation
5. Scoring explanation
6. Ranked vs unranked explanation
7. Privacy/data consent options
8. Optional tutorial/practice round
9. Home dashboard entry

Must-have launch scope:

- Basic first-run onboarding
- Rules explanation
- Display name setup
- Privacy/consent acknowledgement where legally required

### 5.3 Home Dashboard

Must show:

- Player display name/avatar
- Current rating/rank if ranked is enabled
- Create lobby action
- Join by code action
- Quick join action
- Public lobby browser action
- Active/rejoinable lobby or match
- Recent match summary
- Navigation to profile, settings, and leaderboard
- Notices for maintenance/moderation/app updates

### 5.4 Create Lobby

Flow:

1. User selects “Create Lobby.”
2. User chooses public/private.
3. User configures settings.
4. System creates lobby and generates lobby code.
5. Host shares code or waits for public players.
6. Host starts match once requirements are met.

Must-have settings:

- Visibility: public/private
- Player capacity
- Number of rounds
- Time limit per round
- Word difficulty
- Rated/unrated
- Scoring preset
- Language/dictionary if more than one language is planned

Requirements:

- Lobby code must be short, human-shareable, and collision-safe.
- Private lobbies are joinable by code/link only.
- Public lobbies appear in browser while joinable.
- Rated lobbies must enforce ranked-compatible settings.
- Host must be clearly identified.
- Lobby must expire after inactivity.

### 5.5 Join by Code

Requirements:

- Codes should be normalized/case-insensitive.
- Invalid/expired/full/already-started lobbies must return clear errors.
- Join must be atomic to avoid overfilling.
- Public lobby browser should refresh if a lobby fills before join completes.

### 5.6 Public Lobby Browser

Requirements:

- Filter/sort by difficulty, rated/unrated, time limit, player count, and optionally region/latency.
- Do not show abandoned, full, expired, or already-started lobbies.
- Join attempt must handle race conditions.
- Rated public lobbies must expose eligibility rules.

### 5.7 Quick Join / Random Matchmaking

Requirements:

- Optional ranked/unranked, difficulty, and mode filters.
- Timeout behavior.
- Cancellation support.
- Duplicate queue prevention.
- Rated matchmaking should prefer similar rating/MMR.
- Unranked matchmaking may prioritize availability and latency.

## 6. Lobby Lifecycle

Recommended lobby states:

1. `created`
2. `waiting`
3. `ready`
4. `starting`
5. `in_progress`
6. `completed`
7. `abandoned`
8. `cancelled`
9. `expired`

Host permissions before match start:

- Change allowed settings
- Kick players if moderation policy allows
- Start match
- Cancel lobby
- Transfer host if supported

Host leaving behavior:

- Before match: transfer host to earliest joined eligible player.
- During match: match continues if minimum viable players remain.
- After match: host transfer only matters for rematch controls.
- If no players remain: lobby is abandoned after timeout.

## 7. Game Lifecycle

Recommended match states:

1. `initializing`
2. `round_starting`
3. `round_active`
4. `round_ended`
5. `next_round`
6. `completed`
7. `abandoned` / `cancelled`

Standard Wordle-style rules:

- Hidden target word selected from approved answer list.
- Fixed-length guesses.
- Feedback for correct position, present wrong position, absent.
- Maximum guesses per round.
- Invalid guesses should be rejected without consuming attempt, but still consume time.
- Duplicate-letter handling must match defined Wordle-style rules.
- Round ends when solved, guesses exhausted, timed out, or disconnected beyond grace period.

Open product decisions:

- Fixed 5-letter only at launch vs configurable word length.
- Standard 6 guesses vs configurable/difficulty-based.
- Invalid guesses consume time only vs attempt + time.

## 8. Scoring Requirements

Scoring should reward:

- Solving the word
- Fewer guesses
- Faster solve time
- Consistency across rounds
- Avoiding failures/timeouts

Recommended V1 scoring concept:

- Base solve points: 100
- Guess bonus:
  - 1 guess: +60
  - 2 guesses: +50
  - 3 guesses: +40
  - 4 guesses: +25
  - 5 guesses: +10
  - 6 guesses: +0
- Speed bonus based on percentage of time remaining.
- Failed/timeout round: 0 or small participation score.

Tie-breakers:

1. Higher total score
2. More rounds solved
3. Lower total guesses
4. Faster total solve time
5. Better final-round result
6. Declared tie if still equal

## 9. Ranked / Rated Games

Rated games require:

- Authenticated accounts
- Ranked-compatible lobby settings
- Approved word list
- Anti-cheat telemetry
- Minimum player count
- Stable match completion rules
- No custom dictionaries or experimental variants unless ranked-supported

Rating/MMR must support:

- Persistent rating per player
- Rating changes after rated matches
- Rating history visible on profile
- Global leaderboard
- Placement/provisional state for new users

Rating algorithm decision remains open:

- Elo
- Glicko-2
- TrueSkill-style multiplayer rating
- Custom placement-based MMR

Recommendation: avoid simple Elo if multiplayer ranked launches with more than two players.

## 10. Leaderboards

Must-have:

- Global ranked leaderboard
- Season/current period leaderboard
- Pagination
- Filtering by season/mode/difficulty where relevant
- Duplicate display-name handling
- Exclusion of banned/deleted/private users as policy requires
- Deterministic tie handling

Leaderboard entries should show:

- Rank
- Display name/handle
- Rating/MMR/ranked points
- Matches played
- Win rate or placement metric
- Optional streak/recent form
- Badge/rank tier if implemented

## 11. Profiles and Statistics

Profiles should show:

- Display name/handle
- Avatar
- Current rank/rating
- Peak rank/rating
- Match count
- Win rate / placement distribution
- Average score
- Average guesses
- Average solve time
- Streaks
- Recent matches
- Rating history chart
- Achievements/badges if included

Match history should show:

- Date/time
- Mode
- Rated/unrated
- Lobby type
- Difficulty
- Number of rounds
- Placement
- Score
- Rating change
- Link to match report

Privacy requirement:

- Users may need public/private profile visibility controls.

## 12. Word Library Requirements

The system should distinguish:

1. Answer words
2. Guess-valid words
3. Banned/excluded words
4. Difficulty-tagged words

Word metadata should include:

- Text
- Language/locale
- Length
- Difficulty
- Frequency/commonness score
- Part of speech, optional
- Category/theme, optional
- Offensive/sensitive flags
- Active/inactive status
- Source/version
- Last reviewed timestamp

Word library must support:

- Server-driven updates without app release
- Versioned dictionaries
- Admin review workflow
- Staged rollout/A-B testing if needed
- Future language expansion

## 13. Analytics and Data Collection

Collect product events for:

- Registration/login
- Onboarding step completion
- Lobby creation
- Lobby join attempts/failures
- Quick join queue start/cancel/timeout/success
- Match start/completion/abandonment
- Round start/end
- Guess validity
- Solve/fail/timeout
- Scoring outcomes
- Rating changes
- Profile/leaderboard views
- Settings changes
- Reports/moderation actions

Privacy requirements:

- Clear privacy policy.
- Consent where required.
- Separate strictly necessary gameplay data from analytics/training usage.
- User access/deletion/export rights where legally required.
- Prefer pseudonymous internal IDs.
- Avoid collecting free-text chat unless needed.
- Explicit consent for training/insight use where required.
- Children/minor policy before launch.

## 14. Admin and Moderation

Admin capabilities:

- Search users
- View account status and match history
- Review suspicious matches
- Moderate display names/usernames
- Ban/suspend users
- Remove users from leaderboards
- Void rated matches
- Manage word library
- View analytics dashboards
- Inspect lobby/match state
- Resolve reports

Moderation must-have:

- Report user/profile
- Report suspicious match
- Flag offensive display names
- Admin action audit log
- Ban/suspend account
- Hide/remove banned users from leaderboards

## 15. Settings

User settings should include:

- Account info
- Display name/avatar
- Password/OAuth management
- Notification preferences
- Privacy/profile visibility
- Analytics consent/preferences
- Language/locale
- Theme/accessibility
- Sound/haptics
- Delete account
- Log out all devices

Game/accessibility settings should include:

- Colorblind mode
- High contrast mode
- Reduced motion
- Keyboard preferences
- Timer display preference
- Optional submit confirmation

## 16. Mobile + Web Expectations

Shared expectations:

- Same account across platforms
- Same game rules
- Cross-platform multiplayer
- Responsive layout
- Real-time state updates
- Reconnect support
- Accessibility support
- Reliable latency/error handling

Mobile-specific expectations:

- Backgrounding should not corrupt match state.
- Foregrounding should reconnect and resync.
- Push notifications should be considered.
- App-store readiness requires privacy disclosures, account deletion support, reporting/moderation policy if user-generated profiles/chat exist, crash reporting, and version/update handling.

Web-specific expectations:

- Browser refresh/reconnect support
- Deep links for lobby codes
- Responsive desktop/tablet/mobile layout
- Secure cookie/session handling
- Browser compatibility policy

## 17. Edge Cases and Required Behavior

### Player Disconnects

- Before match: remove after inactivity timeout.
- During match: reconnect grace period.
- Timer likely continues server-side.
- If grace expires, mark timeout/fail/forfeit depending on match state.
- Rated disconnects should be penalized unless server/system fault caused the issue.

### App Backgrounding

- Preserve state locally.
- Reconnect on foreground.
- Server timer remains authoritative.
- Long background duration may cause timeout/forfeit.

### Host Leaves

- Transfer host before match if possible.
- During match, continue match.
- After match, transfer only for rematch controls.
- If no players remain, abandon lobby.

### Invalid Word Guesses

- Show clear feedback.
- Recommended: do not consume attempt, but consume time.
- Rate-limit repeated invalid submissions.
- Track invalid guess rates for UX and suspicious behavior signals.

### Duplicate Usernames / Display Names

Recommended:

- Internal user ID is unique identity.
- Handle is globally unique if adopted.
- Display name may be non-unique.
- UI disambiguates duplicate display names with handle/avatar/short code.

### Cheating / Suspicious Solves

Suspicious patterns:

- Unrealistically fast solves
- Repeated first-guess solves
- Bot-like timing
- Abnormally high hard-word performance
- Client tampering signals
- Known leaked answer usage

Requirements:

- Do not accuse users in UI automatically.
- Internally flag suspicious matches.
- Allow admin review.
- Rated impact may be delayed, reversed, or voided.
- Anti-cheat must not rely on client trust.

### Quick Join Timeout

- Clear timeout message.
- Options: retry, broaden filters, create lobby, cancel.
- Queue entry cleaned up.
- Timeout tracked analytically.

### Public Lobby Full Before Join

- Join attempt must be atomic.
- User sees “Lobby is full.”
- App may suggest similar lobbies or quick join.
- Browser refreshes/removes full lobby.

## 18. Feature Priority Table

| Feature | Priority | Notes |
|---|---:|---|
| Register/login | Must-have | Required for profiles, ranked, moderation |
| Password reset/session management | Must-have | Production auth baseline |
| Onboarding basics | Must-have | Rules, display name, privacy acknowledgement |
| Home dashboard | Must-have | Primary navigation and rejoin state |
| Private lobbies | Must-have | Core social gameplay |
| Public lobbies | Must-have | Core multiplayer discovery |
| Join by code/link | Must-have | Core lobby flow |
| Public lobby browser | Must-have | Required by prompt |
| Quick join/random matchmaking | Must-have | Required by prompt |
| Lobby settings | Must-have | Rounds, timer, difficulty, rated, scoring |
| Standard Wordle gameplay | Must-have | Core game |
| Server-authoritative match state | Must-have | Fairness/reconnect/security |
| Scoring system | Must-have | Competitive foundation |
| Match report | Must-have | End-of-match clarity |
| Ranked matches | Must-have | Required by prompt |
| Rating/MMR | Must-have | Required for ranked |
| Global leaderboard | Must-have | Required by prompt |
| Player profile | Must-have | Stats, rating, match history |
| Word library with difficulty | Must-have | Core content system |
| Analytics event tracking | Must-have | Product/data foundation |
| Privacy/consent controls | Must-have | Required due to analytics/training direction |
| Basic admin/moderation | Must-have | Production safety baseline |
| Suspicious solve flagging | Should-have | Important for ranked integrity |
| Push notifications | Should-have | Mobile engagement |
| Rating history charts | Should-have | Profile quality |
| Seasonal leaderboards | Should-have | Competitive retention |
| App-store readiness | Must-have | Required for mobile launch |
| Advanced anti-cheat | Later | Needs telemetry/tuning |
| Friends/social graph | Later | Useful, not core |
| Chat | Later | Adds moderation burden |
| Custom word packs | Later | Requires content safety controls |
| Game variants | Later | Design for future, do not launch-block |
| Tournaments/events | Later | Expansion path |
| Monetization/cosmetics | Later | Not specified as launch requirement |

## 19. Recommended Launch Scope

Launch V1 should include:

- Account registration/login
- Basic onboarding
- Home dashboard
- Private lobbies
- Public lobbies
- Join by code/link
- Public lobby browser
- Quick join
- Standard 5-letter Wordle-style gameplay
- Configurable rounds/time/difficulty/rated toggle
- Server-authoritative game state
- Scoring
- Match reports
- Ranked matches
- Rating/MMR
- Global leaderboard
- Player profiles
- Match history
- Word library with difficulty
- Analytics events
- Privacy/consent controls
- Basic admin/moderation tooling
- Web + mobile-ready UX
- Reconnect handling

Defer unless elevated:

- Friends/social graph
- Chat
- Tournaments
- Custom word packs
- Multiple game variants
- Monetization
- Spectator mode
- Advanced ML anti-cheat
- Multi-language word libraries

## Open Questions

1. Does “Onboarding (1/9)” mean a literal 9-step onboarding flow?
2. Which auth methods are required: email/password, OAuth, magic link, Apple/Google, Discord?
3. Should handles be globally unique while display names are non-unique?
4. What are minimum and maximum lobby player counts for V1?
5. Is V1 fixed to 5-letter words?
6. Is V1 fixed to 6 guesses?
7. Should invalid guesses consume attempts or only time?
8. Should server timers continue during disconnect/app backgrounding? Recommendation: yes.
9. Which lobby settings are allowed for rated matches?
10. Which rating algorithm should be used?
11. How harsh should rated abandon penalties be?
12. Are match reports public, private, or participant-only?
13. Can users hide profile/stats from public view?
14. Should analytics be split into necessary gameplay, product analytics, and training/insight consent scopes?
15. Is the product intended for minors?
16. Are chat/social features excluded from V1?
17. Is full admin dashboard needed at launch, or is internal tooling enough?
18. Is the mobile implementation strategy Expo/React Native, Flutter, native, or PWA-first?
19. English-only at launch or multi-language dictionaries?
20. Any monetization requirements for launch?

## Follow-up Tickets

### Follow-up Ticket 1

- **Target agent:** Athena
- **Why needed:** Athena owns sequencing, scope approval, and turning the PRD into a roadmap.
- **Exact task:** Review this PRD, route open decisions to Ashar, and create the first project plan/ticket breakdown.
- **Inputs/context needed:** This PRD, especially feature priorities and open questions.
- **Expected output back to Athena:** Approved phase plan, ticket list, dependencies, and decision requests for Ashar.

### Follow-up Ticket 2

- **Target agent:** Elisa
- **Why needed:** Architecture/API/data design must follow PRD decisions before implementation.
- **Exact task:** Create the initial system architecture for services, data model, realtime state, auth, rating, lobbies, match lifecycle, analytics, and admin boundaries.
- **Inputs/context needed:** Approved PRD and Ashar’s answers where available.
- **Expected output back to Athena:** Architecture design, service boundaries, data model overview, API/event contract direction, and tradeoff notes.

### Follow-up Ticket 3

- **Target agent:** Freya
- **Why needed:** Backend/core logic implementation will be substantial.
- **Exact task:** After architecture/API approval, implement backend foundations for auth, users, lobbies, match state, word validation, scoring, and persistence.
- **Inputs/context needed:** Approved architecture, API contracts, data model, and chosen backend stack.
- **Expected output back to Athena:** Backend implementation summary, files changed, tests run, and contract gaps.

### Follow-up Ticket 4

- **Target agent:** Luna
- **Why needed:** Product-facing UI must cover web/mobile gameplay flows.
- **Exact task:** Create UX/UI flows for onboarding, home dashboard, create lobby, join by code, public lobby browser, quick join, lobby waiting room, gameplay, match report, profile, leaderboard, and settings.
- **Inputs/context needed:** PRD, approved platform strategy, API contracts once available.
- **Expected output back to Athena:** Screens/flow spec or frontend implementation plan with component boundaries and UX edge cases.

### Follow-up Ticket 5

- **Target agent:** Ruby
- **Why needed:** Word library, analytics pipelines, scripts, and data tooling need dedicated support.
- **Exact task:** Research and propose word list sourcing/import tooling, difficulty tagging, dictionary versioning, and analytics event pipeline requirements.
- **Inputs/context needed:** PRD word library and analytics sections.
- **Expected output back to Athena:** Word data pipeline proposal, analytics event catalog, import/moderation tooling plan.

### Follow-up Ticket 6

- **Target agent:** Yuna
- **Why needed:** Production deployment, mobile/web hosting, secrets, CI/CD, and reliability need early planning.
- **Exact task:** Propose deployment architecture, environments, CI/CD, secrets management, observability, app-store readiness checklist, and runtime reliability requirements.
- **Inputs/context needed:** PRD, expected tech stack once chosen, production-grade launch requirement.
- **Expected output back to Athena:** Operations/deployment plan, environment matrix, monitoring requirements, launch readiness checklist.

### Follow-up Ticket 7

- **Target agent:** Jasmine
- **Why needed:** QA must independently verify core lifecycle, edge cases, and release confidence.
- **Exact task:** Create QA strategy and acceptance test matrix for auth, onboarding, lobbies, matchmaking, gameplay, reconnects, scoring, ranked behavior, profiles, leaderboards, analytics, admin, and mobile/web behavior.
- **Inputs/context needed:** PRD and later API/frontend/backend specs.
- **Expected output back to Athena:** Test plan, edge-case matrix, regression checklist, and release-blocker criteria.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-01-elisa-product-requirements-document-response.md`

## Tests / Commands Run

None — planning/spec task only.

## Evidence / Result

Created this Markdown PRD response file in the required responses folder. The content covers the ticket acceptance criteria: core user journeys, must/should/later features, lobby lifecycle, game lifecycle, ranked/unranked behavior, profile/statistics, leaderboards, word library, analytics/privacy, edge cases, open decisions, and follow-up tickets.

## Risks / Blockers

1. **Scope is large:** This is launch-grade scope. Athena should phase it before implementation.
2. **Ranked multiplayer rating is complex:** Exact algorithm and player count assumptions must be resolved.
3. **Anti-cheat depends on architecture:** Ranked play should not rely on client-side authority.
4. **Privacy/data requirements affect early design:** Analytics and potential training/insight use must be consent-aware from day one.
5. **Mobile launch has compliance requirements:** App-store privacy disclosures, account deletion, reporting/moderation, and retention policies cannot be deferred too late.
6. **Word library quality is product-critical:** Offensive, obscure, or incorrect words can damage player trust quickly.
