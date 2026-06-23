# Ticket 9 — Branding and Visual Direction — Response

## Summary

Created a visual and brand direction plan for Wordle Royale. The plan gives Athena three distinct directions, each with palette, typography, logo/app-icon ideas, UI style, tone, ranked language, casual lobby language, and share-card/report treatment.

Recommendation: use Direction 1, "Crown Grid Arena," as the primary launch direction. It best balances Wordle clarity, competitive polish, mobile app-store readiness, and casual approachability.

## Decisions / Recommendations

- Use a tile-first brand system. The grid is the clearest product symbol and should anchor the logo, app icon, loading states, match reports, and share cards.
- Avoid copying classic Wordle too closely. Keep the letter-tile logic, but add a crown/arena identity, deeper palette, stronger typography, and multiplayer motion language.
- Build ranked and casual modes from the same base system, but tune intensity:
  - Ranked: darker surfaces, sharper borders, gold accents, rating badges, precise stats.
  - Casual: warmer surfaces, softer cards, invite/share emphasis, friendlier copy.
- Use color plus pattern/icon states for tile feedback so colorblind support is native to the brand.
- Keep the tone confident and playful, not gamer-toxic. The product should feel competitive without sounding aggressive.
- Prioritize a scalable app icon that works at small sizes: a 5x5 tile grid with a simple crown silhouette is stronger than detailed mascot art.

## Detailed Output

### Direction 1: Crown Grid Arena

#### Core idea

Word puzzle meets competitive arena. This direction treats the Wordle grid as a battle board and uses a crown as the rank/progression symbol. It feels polished, direct, and easy to understand at app-icon size.

Best for: launch brand, app icon, ranked and casual balance.

#### Visual keywords

- Competitive
- Clean
- Premium
- Tile-based
- Focused
- App-store ready

#### Color palette

| Role | Color | Hex | Usage |
|---|---:|---|---|
| Midnight navy | Primary background | `#101827` | App shell, landing hero, ranked surfaces |
| Deep slate | Secondary background | `#172033` | Cards, lobby panels, modals |
| Tile cream | Light tile surface | `#F7F1DF` | Public landing contrast, casual cards |
| Crown gold | Primary accent | `#F4C542` | Logo crown, ranked highlights, winners |
| Royal green | Correct tile | `#2FA66A` | Correct letter state |
| Signal amber | Present tile | `#D89B2B` | Present letter state |
| Ash gray | Absent tile | `#6B7280` | Absent letter state |
| Electric blue | Interactive accent | `#4F8CFF` | Links, focus states, secondary CTAs |
| Error red | Error/destructive | `#E04F5F` | Invalid states, account deletion, failures |
| White | Text on dark | `#F8FAFC` | Primary text |

#### Typography suggestions

- Logo / display: `Sora`, `Space Grotesk`, or `Clash Display` if licensed.
- UI text: `Inter`, `Geist`, or `SF Pro` on iOS.
- Numeric/stat emphasis: `Sora` or `Roboto Mono` for timers, rating deltas, and score blocks.

Typography behavior:

- Logo should use strong geometric letters.
- Timer and score should use tabular numerals.
- Ranked labels should be compact and all-caps only where useful, such as `RATED`, `ROUND 2/5`, `+14 MMR`.

#### Logo ideas

1. Wordmark: `Wordle Royale` with a crown replacing the dot/accent above a stylized tile cluster.
2. Lockup: 5 tile squares forming a W shape, with a small crown above the center tile.
3. Horizontal logo: crown-grid mark on the left, `Wordle Royale` on the right, with `Royale` in gold.
4. Compact logo: single crowned tile with `WR` inside for nav and favicon use.

Logo rules:

- Avoid tiny letter details in the mark.
- Make a one-color version for small UI and loading states.
- Keep enough separation from the original Wordle visual identity.

#### App icon ideas

1. 5x5 grid on midnight navy, center row spelling implied by abstract tiles, gold crown above the center.
2. Single large cream tile with green/yellow corner facets and a gold crown shadow.
3. Shield-shaped tile grid with crown top. Strong for competitive positioning, but use carefully so it does not become too fantasy/RPG.

Recommended app icon: 5x5 grid + crown. It communicates word puzzle and competition instantly.

#### UI style notes

- Dark default shell with high-contrast tile surfaces.
- Cards have 16-20px radius on mobile, 12-16px on desktop.
- Tile states use color, icon/pattern, and border treatment.
- Ranked surfaces use sharper lines, gold dividers, and compact stat chips.
- Casual lobby surfaces use softer tile cream cards and larger share buttons.
- Primary buttons should feel solid and tappable: gold for major ranked actions, blue/green for normal play actions.
- Avoid heavy gradients except in hero areas and share cards.

#### Tone of voice

- Confident, short, and game-like.
- Avoid trash talk.
- Use verbs that imply action: Play, Climb, Rematch, Ready Up, Share.

Examples:

- "Ready up. Round starts soon."
- "You placed 2nd. +14 MMR."
- "Invite friends with code ABC123."
- "Fast solve. Clean finish."

#### Ranked / competitive visual language

- Dark navy background.
- Gold rank tier badges.
- Thin neon-blue focus rings.
- Compact stat cards for MMR, placement, score, solve time.
- Leaderboard rows with current user highlighted by gold edge.
- Rating delta badges: green for gain, red for loss, neutral gray for no change.

#### Casual / public lobby visual language

- Cream or soft slate cards.
- Clear share button and lobby code.
- Friendly ready states.
- Difficulty and timer shown as chips rather than intimidating stats.
- Copy should name people when possible: "Waiting for Maya to ready up."

#### Match report / share-card direction

Share card format:

```text
Wordle Royale
Placed 2nd of 5
Score: 3,820   +14 MMR
Rounds: 4/5 solved

⬛ 🟨 🟩 🟩 ⬛
🟨 🟩 🟩 🟩 🟩
...

wordleroyale.app
```

Visual treatment:

- Dark navy background.
- Crown gold top accent.
- Tile-grid result pattern.
- No answer leakage unless product explicitly allows it.
- Strong final placement card at top.

### Direction 2: Neon Word Coliseum

#### Core idea

A more energetic, esports-inspired direction. It uses neon accents, glassy panels, and arena lighting. It feels modern and exciting, but it is riskier because it can become visually noisy for a word puzzle.

Best for: marketing pages, trailers, seasonal ranked events, younger/mobile audience.

#### Visual keywords

- Electric
- Fast
- Spectator-friendly
- Arena-like
- High-energy

#### Color palette

| Role | Color | Hex | Usage |
|---|---:|---|---|
| Void black | Primary background | `#080B12` | App shell, hero, ranked screens |
| Neon violet | Primary accent | `#8B5CF6` | Buttons, glow, active states |
| Cyan beam | Secondary accent | `#22D3EE` | Focus rings, links, progress |
| Hot coral | Alert/action accent | `#FF4D6D` | Errors, urgent timer warnings |
| Lime correct | Correct tile | `#39D98A` | Correct letter state |
| Solar yellow | Present tile | `#FFD166` | Present letter state |
| Graphite | Absent tile | `#5C6472` | Absent letter state |
| Panel glass | Card surface | `#151A26` | Panels and modals |
| Text white | Primary text | `#F8FAFC` | Text on dark |

#### Typography suggestions

- Logo / display: `Orbitron`, `Rajdhani`, or `Sora`.
- UI text: `Inter` or `Geist`.
- Stats/timer: `JetBrains Mono` or `Roboto Mono`.

Use display typography sparingly. A fully sci-fi UI can hurt readability.

#### Logo ideas

1. Angular wordmark with a glowing tile replacing the `O` in Wordle.
2. Neon crown outline over a grid, like an arena scoreboard.
3. `WR` monogram with tile cutouts and cyan/violet glow.

#### App icon ideas

1. Black background, neon crown, cyan/violet tile grid.
2. A glowing five-letter row with a crown light beam above it.
3. Rounded-square icon with diagonal arena light streaks behind the grid.

#### UI style notes

- Dark glass panels with neon borders.
- Strong hover/focus glow on web.
- Animated match start countdown can feel like arena lights, but must respect reduced motion.
- Works well for ranked events, but use restraint on gameplay so the word grid remains readable.

#### Tone of voice

- Sharper and more energetic.
- Still avoid insults or aggressive copy.

Examples:

- "Queue locked. Match found."
- "Round starts in 5."
- "Climb the board."
- "Run it back."

#### Ranked / competitive visual language

- Strongest direction for ranked presentation.
- Neon rating deltas, leaderboard streak badges, and match-start animations.
- Could support seasonal themes well.

#### Casual / public lobby visual language

- Risk: casual lobbies may feel too intense.
- Soften with less glow, larger cards, and simpler copy.
- Use violet/cyan accents only for actions and status.

#### Match report / share-card direction

- Looks like a broadcast scoreboard.
- Dark background, neon placement number, grid summary below.
- Best for social sharing if the app wants a bold gamer feel.

### Direction 3: Letterpress Royale

#### Core idea

A warmer, premium puzzle-club direction. It feels like a modern board game or newspaper puzzle room with royal accents. It is friendlier and more timeless, but less immediately competitive.

Best for: casual audiences, broad age range, less esports-heavy positioning.

#### Visual keywords

- Warm
- Clever
- Approachable
- Premium puzzle
- Social
- Calm

#### Color palette

| Role | Color | Hex | Usage |
|---|---:|---|---|
| Ink | Primary text/background | `#1F2933` | Text, dark surfaces |
| Parchment | Main light background | `#F3E9D2` | Landing, casual cards |
| Paper white | Surface | `#FFFDF7` | Cards, dialogs |
| Royal burgundy | Primary accent | `#8C2F39` | Logo, ranked accents |
| Brass gold | Secondary accent | `#C89B3C` | Crown, medals, highlights |
| Garden green | Correct tile | `#3F8F5F` | Correct state |
| Ochre | Present tile | `#C58B2A` | Present state |
| Warm gray | Absent tile | `#7A7468` | Absent state |
| Blue ink | Link/focus | `#315C9B` | Links, focus, secondary buttons |

#### Typography suggestions

- Logo / display: `Fraunces`, `Recoleta`, or `Libre Baskerville`.
- UI text: `Inter`, `Source Sans 3`, or `Avenir Next`.
- Stats: `IBM Plex Mono` or `Roboto Mono`.

This direction can use a serif wordmark, but gameplay UI should stay clean and sans-serif.

#### Logo ideas

1. Serif wordmark with a small crown and tile underline.
2. Tile seal: a square tile with a crown and subtle paper texture.
3. `WR` monogram inside a letterpress-style badge.

#### App icon ideas

1. Parchment tile with burgundy `W` and brass crown.
2. Rounded square with four word tiles and a seal-like crown.
3. Cream background with a single green solved tile and crown stamp.

#### UI style notes

- Light default surfaces with dark text.
- Rounded cards, subtle paper texture, restrained shadows.
- Strong readability for word grids.
- Ranked screens use burgundy/brass instead of neon.
- Casual lobbies feel welcoming and social.

#### Tone of voice

- Clever, warm, and slightly playful.

Examples:

- "A fresh round awaits."
- "Invite your table."
- "Nice solve. Faster than the room."
- "Ready for a rematch?"

#### Ranked / competitive visual language

- Rank tiers feel like medals, seals, and ribbons.
- Less intense than Direction 1 or 2.
- Good for a prestige puzzle feel, not an esports feel.

#### Casual / public lobby visual language

- Strongest casual direction.
- Public lobbies can feel like puzzle tables or rooms.
- Invite/share flows feel natural and friendly.

#### Match report / share-card direction

- Share card feels like a printed match slip.
- Cream background, burgundy header, brass placement medal, tile grid summary.
- Very readable, but may look less modern in app stores.

### Tagline options

General:

1. "Guess fast. Rule the grid."
2. "Word battles, one round at a time."
3. "The multiplayer word race."
4. "Outguess the room."
5. "Climb the grid."
6. "Think quick. Score faster."
7. "Wordle, with rivals."
8. "Every guess counts."

Competitive/ranked:

1. "Climb the leaderboard, one word at a time."
2. "Prove your pace."
3. "Rank up on every solve."
4. "Fast words. Fair fights."
5. "The arena for word players."

Casual/social:

1. "Start a room. Share a code. Play in seconds."
2. "Bring friends. Guess words. Brag later."
3. "Your next word night starts here."
4. "A quick word battle with friends."

Recommended launch tagline: "Guess fast. Rule the grid."

Why: short, competitive, understandable, and strongly tied to the grid/crown identity.

### Cross-direction UI guidance

#### Tile feedback system

Every direction should use accessible tile feedback:

- Correct: color + strong border + check/corner marker
- Present: color + diagonal stripe or dot pattern
- Absent: muted color + dash/minus marker
- Pending: empty tile surface
- Locked/submitted: stable state with server-confirmed feedback

#### Button hierarchy

- Primary: Play, Ready, Start Match, Rematch
- Secondary: Share, Copy Code, Browse Lobbies
- Tertiary: Learn Rules, View Details
- Destructive: Leave Match, Delete Account

#### Motion direction

- Gameplay motion should be fast and restrained.
- Tile flip can exist, but reduced motion must replace it.
- Ranked match start can use a countdown pulse.
- Casual invite/share actions should use small, friendly feedback.

#### Iconography

Recommended icon set style:

- Rounded but crisp line icons.
- Crown, grid, timer, trophy, people, lock, globe, code, signal, warning.
- Use filled icons only for badges and major status indicators.

### Best direction recommendation

Choose Direction 1: Crown Grid Arena.

Reasons:

- It communicates word puzzle + competition immediately.
- It scales well from app icon to desktop landing page.
- It can support both ranked and casual modes without feeling split.
- It has enough personality without becoming childish, fantasy-heavy, or too esports.
- It leaves room for seasonal ranked visuals later.
- It is easier to implement consistently across Next.js web and Expo React Native than a texture-heavy or neon-heavy system.

Use Direction 2 as a secondary influence for ranked events, match start moments, and social marketing. Use Direction 3 as a reference for casual lobby warmth and broad accessibility.

## Open Questions

1. Does Wordle Royale need to avoid using "Wordle" in the product name for trademark/legal reasons, or has that already been cleared?
2. Should the default app theme be dark, light, or system-based?
3. Will the product support custom avatars at launch, or only generated avatars/colors?
4. Are rank tiers confirmed, and if so what names should they use?
5. Should share cards reveal target words after a match, or always stay spoiler-safe?
6. Is the target audience more casual mobile players, competitive puzzle players, or party-game groups?
7. Does Athena want Luna to produce actual visual mockup files next, or only implementation-ready brand guidance for now?

## Follow-up Tickets

### Ticket: Create brand token spec

- Target agent: Luna
- Why that agent is needed: Frontend implementation needs concrete colors, typography, spacing, radius, shadows, and state tokens.
- Exact task: Convert the chosen visual direction into a design token document covering color roles, typography scale, spacing, radius, shadows, tile states, rank badges, and accessibility variants.
- Inputs/context they need: This branding response, Ticket 3 UX plan, selected direction from Athena.
- Expected output back to Athena: Markdown token spec or `DESIGN.md`-style file ready for frontend implementation.

### Ticket: Create logo and app icon concept sheet

- Target agent: Luna or a visual design specialist
- Why that agent is needed: Athena needs concrete visual options before finalizing the brand.
- Exact task: Produce 3-5 rough logo/app icon concepts for the selected direction, including small-size notes and one-color variants.
- Inputs/context they need: Selected direction, app icon constraints, any legal naming guidance.
- Expected output back to Athena: Concept sheet with recommended logo/icon option and implementation notes.

### Ticket: Build landing page visual mockup

- Target agent: Luna
- Why that agent is needed: The landing page sets the public brand impression.
- Exact task: Create a static web mockup for the Wordle Royale public landing page using the selected visual direction.
- Inputs/context they need: Ticket 3 landing page UX, selected branding direction, tagline choice.
- Expected output back to Athena: Mockup file, screenshot, responsive notes, and any implementation risks.

### Ticket: Build gameplay visual mockup

- Target agent: Luna
- Why that agent is needed: Gameplay readability is the highest-risk visual surface.
- Exact task: Create mobile and desktop mockups of the live gameplay screen, including active, invalid word, solved, timed out, and reconnect states.
- Inputs/context they need: Ticket 3 gameplay wireframe, selected brand tokens, accessibility requirements.
- Expected output back to Athena: Mockup files or screenshots plus notes on readability and accessibility.

### Ticket: Build match report/share-card mockup

- Target agent: Luna
- Why that agent is needed: Share cards are a growth surface and need a consistent visual system.
- Exact task: Design spoiler-safe match report and share-card layouts for ranked and casual matches.
- Inputs/context they need: Match report requirements, selected branding direction, sharing rules from Athena/Elisa.
- Expected output back to Athena: Share-card mockups, export dimensions, and copy recommendations.

### Ticket: Accessibility review of brand palette

- Target agent: Jasmine
- Why that agent is needed: Independent QA should validate contrast and colorblind usability before implementation.
- Exact task: Check selected palette against WCAG contrast needs and colorblind tile-state distinguishability.
- Inputs/context they need: Selected palette, tile feedback system, Ticket 3 accessibility requirements.
- Expected output back to Athena: Accessibility pass/fail report with required color/token changes.

### Ticket: Legal/product naming check

- Target agent: Athena or human owner
- Why that agent is needed: The project name includes "Wordle," which may need legal/product review before public launch.
- Exact task: Confirm whether Wordle Royale is safe as a public product name or whether a rename is needed before brand assets are finalized.
- Inputs/context they need: Product name, launch plans, distribution channels.
- Expected output back to Athena: Approved name or rename instruction.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-09-luna-branding-visual-direction-response.md`

## Tests / Commands Run

None — planning/spec task only. No project tests were run.

## Evidence / Result

- Read the assigned ticket: `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/tickets/ticket-09-luna-branding-visual-direction.md`.
- Created this response file in the required responses folder.
- The response includes 3 distinct visual directions, color palettes, typography suggestions, app icon ideas, logo ideas, tagline options, UI style notes, share-card/result-card direction, a recommended best direction, and follow-up design tickets.

## Risks / Blockers

- No actual logo, icon, or mockup image files were produced in this ticket because the assigned deliverable was a Markdown brand direction response.
- The product name may need legal review because it includes "Wordle."
- Palette choices should be validated by Jasmine or a design/accessibility pass before implementation.
- Final scoring/ranking labels are still dependent on product and architecture decisions from Athena/Elisa.
