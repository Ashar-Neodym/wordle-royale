# Ticket 3 — UX Flow and Wireframe Plan

**Assigned agent:** Luna  
**Priority:** P0  
**Depends on:** Elisa Ticket 1 PRD and Elisa Ticket 2 Architecture/API Contract

## Context

We are building **Wordle Royale**, a production-grade mobile + web multiplayer competitive Wordle-style game.

Elisa has completed:

1. Product Requirements Document.
2. Technical Architecture and API Contract.

Key confirmed direction:

- Name: Wordle Royale.
- Web: Next.js / React.
- Mobile: Expo React Native.
- Backend: TypeScript backend with PostgreSQL, Redis, WebSockets.
- Real-time server-authoritative gameplay.
- Large word library with difficulty levels.
- Future analytics/data insights are expected, so privacy/consent screens matter.
- Launch should be polished and production-grade, not MVP-looking.

## Objective

Create the full UX flow and wireframe-level screen plan for Wordle Royale.

## Scope

Design the user experience for:

- Public landing page.
- Login/register/forgot password.
- First-run onboarding.
- Display name / handle setup.
- Privacy and analytics consent screen.
- Authenticated home dashboard.
- Quick Join flow.
- Create Lobby flow.
- Join by Code flow.
- Public Lobby Browser.
- Lobby Waiting Room.
- Host settings panel.
- Real-time gameplay screen.
- Round transition screen.
- Match report screen.
- Leaderboard.
- User profile.
- Match history.
- Rating history graph.
- Settings.
- Account deletion/privacy controls.
- Error/loading/empty/reconnect states.

## Important UX requirements

Game screen must include:

- Word grid.
- Keyboard.
- Timer.
- Round number.
- Current score.
- Player progress panel.
- Connection/reconnect status.
- Invalid word feedback.
- State for solved/failed/timed out.

Lobby screen must include:

- Lobby code and share action.
- Player list.
- Ready states.
- Host indicator.
- Public/private visibility.
- Rated/unrated indicator.
- Difficulty, rounds, timer, player count.
- Start button if host.
- Clear status if waiting for players.

Match report must include:

- Final placement.
- Total score.
- Per-round breakdown.
- Guess counts.
- Solve times.
- Rating/MMR change if rated.
- Rematch action.
- Share result action.

## Acceptance criteria

Your `.md` response must include:

1. Full screen inventory.
2. Navigation map.
3. Primary user flows.
4. Wireframe descriptions for each major screen.
5. Mobile layout notes.
6. Web layout notes.
7. Component boundaries.
8. Loading/error/empty/reconnect states.
9. Accessibility notes:
   - colorblind support
   - high contrast
   - reduced motion
   - keyboard/screen reader considerations
10. UX recommendations for ranked/competitive feel.
11. UX recommendations for casual lobby feel.
12. Follow-up implementation tickets for frontend.

## Deliverable back to Athena

Return a Markdown file named similar to:

`wordle-royale-ux-flow-wireframe-plan.md`

---

---

## Global agent response rule

Do **not** reply as a long Discord/chat message. Create a Markdown file in:

`agent-communication/responses/`

Use this filename pattern:

`ticket-XX-agentname-short-title-response.md`

Use this response format:

```markdown
# [Ticket Title] — Response

## Summary

## Decisions / Recommendations

## Detailed Output

## Open Questions

## Follow-up Tickets

## Files Changed
If no files changed, write: None.

## Tests / Commands Run
If none, write: None — planning/spec task only.

## Evidence / Result

## Risks / Blockers
```

Do not invent files, commands, tests, outputs, deployments, or verification evidence.
